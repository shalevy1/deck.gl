// Copyright (c) 2015 - 2017 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import {createIterable} from '@deck.gl/core';
import {worldToPixels} from '@math.gl/web-mercator';

const R_EARTH = 6378000;

/**
 * Calculate density grid from an array of points
 * @param {Iterable} data
 * @param {number} cellSize - cell size in meters
 * @param {function} getPosition - position accessor
 * @returns {object} - grid data, cell dimension
 */
export function pointToDensityGridDataCPU(opts) {
  // const {data, cellSize, attributes, viewport, projectPoints} = opts;
  const hashInfo = _pointsToGridHashing(opts);
  const result = _getGridLayerDataFromGridHash(hashInfo);

  return {
    gridHash: hashInfo.gridHash,
    gridOffset: hashInfo.gridOffset,
    data: result
  };
}

/**
 * Project points into each cell, return a hash table of cells
 * @param {Iterable} points
 * @param {number} cellSize - unit size in meters
 * @param {function} getPosition - position accessor
 * @returns {object} - grid hash and cell dimension
 */
/* eslint-disable max-statements, complexity */
function _pointsToGridHashing({data = [], cellSize, attributes, viewport, projectPoints, gridTransformMatrix}) {
  // find the geometric center of sample points
  let latMin = Infinity;
  let latMax = -Infinity;
  let pLat;

  const {iterable, objectInfo} = createIterable(data);
  const posSize = 3;
  const positions = attributes.positions.value;

  let gridOffset;
  let offsets;
  if (projectPoints) {
    offsets = [0, 0]
    gridOffset = {xOffset: cellSize, yOffset: cellSize};
  } else {
    if (gridTransformMatrix) {
      // convert Hexagon and GridLayer to use gridTransformMatrix
      offsets = [0, 0]
    } else {
      offsets = [180, 90];
    }
    /* eslint-disable-next-line no-unused-vars */
    for (const pt of iterable) {
      objectInfo.index++;
      // TODO: this logic should go into Attribute class
      pLat = positions[objectInfo.index * posSize + 1];
      if (Number.isFinite(pLat)) {
        latMin = pLat < latMin ? pLat : latMin;
        latMax = pLat > latMax ? pLat : latMax;
      }
    }

    const centerLat = (latMin + latMax) / 2;

    gridOffset = _calculateGridLatLonOffset(cellSize, centerLat);

    if (gridOffset.xOffset <= 0 || gridOffset.yOffset <= 0) {
      return {gridHash: {}, gridOffset};
    }
  }


  // calculate count per cell
  const gridHash = {};

  // Iterating over again, reset index
  objectInfo.index = -1;
  for (const pt of iterable) {
    objectInfo.index++;
    // const [lng, lat] = getPosition(pt, objectInfo);
    let lng = positions[objectInfo.index * posSize];
    let lat = positions[objectInfo.index * posSize + 1];

    if (projectPoints) {
      [lng, lat]= viewport.project([lng, lat]);
    } else if (gridTransformMatrix) {
      [lng, lat] = worldToPixels([lng, lat], gridTransformMatrix);
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const latIdx = Math.floor((lat + offsets[1]) / gridOffset.yOffset);
      const lonIdx = Math.floor((lng + offsets[0]) / gridOffset.xOffset);
      const key = `${latIdx}-${lonIdx}`;

      gridHash[key] = gridHash[key] || {count: 0, points: [], lonIdx, latIdx};
      gridHash[key].count += 1;
      gridHash[key].points.push(pt);
    }
  }

  return {gridHash, gridOffset, offsets: [offsets[0] * -1, offsets[0] * -1]};
}
/* eslint-enable max-statements, complexity */

function _getGridLayerDataFromGridHash({gridHash, gridOffset, offsets}) {
  return Object.keys(gridHash).reduce((accu, key, i) => {
    const idxs = key.split('-');
    const latIdx = parseInt(idxs[0], 10);
    const lonIdx = parseInt(idxs[1], 10);

    accu.push(
      Object.assign(
        {
          index: i,
          position: [offsets[0] + gridOffset.xOffset * lonIdx, offsets[1] + gridOffset.yOffset * latIdx]
        },
        gridHash[key]
      )
    );

    return accu;
  }, []);
}

/**
 * calculate grid layer cell size in lat lon based on world unit size
 * and current latitude
 * @param {number} cellSize
 * @param {number} latitude
 * @returns {object} - lat delta and lon delta
 */
function _calculateGridLatLonOffset(cellSize, latitude) {
  const yOffset = _calculateLatOffset(cellSize);
  const xOffset = _calculateLonOffset(latitude, cellSize);
  return {yOffset, xOffset};
}

/**
 * with a given x-km change, calculate the increment of latitude
 * based on stackoverflow http://stackoverflow.com/questions/7477003
 * @param {number} dy - change in km
 * @return {number} - increment in latitude
 */
function _calculateLatOffset(dy) {
  return (dy / R_EARTH) * (180 / Math.PI);
}

/**
 * with a given x-km change, and current latitude
 * calculate the increment of longitude
 * based on stackoverflow http://stackoverflow.com/questions/7477003
 * @param {number} lat - latitude of current location (based on city)
 * @param {number} dx - change in km
 * @return {number} - increment in longitude
 */
function _calculateLonOffset(lat, dx) {
  return ((dx / R_EARTH) * (180 / Math.PI)) / Math.cos((lat * Math.PI) / 180);
}
