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

import AggregationLayer from './aggregation-layer';
import GPUGridAggregator from './utils/gpu-grid-aggregation/gpu-grid-aggregator';
import CPUGridAggregator from './utils/cpu-grid-aggregator';
import {Buffer} from '@luma.gl/core';
import GL from '@luma.gl/constants';
import {Matrix4} from 'math.gl';
import {getBoundingBox, getGridOffset, alignToCell} from './utils/gpu-grid-aggregation/grid-aggregation-utils';

export default class GridAggregationLayer extends AggregationLayer {
  // TODO: need to fix all callers of this method
  initializeState({aggregationProps, getCellSize, projectPoints}) {
    const {gl} = this.context;
    super.initializeState(aggregationProps);
    this.setState({
      gpuGridAggregator: new GPUGridAggregator(gl, {id: `${this.id}-gpu-aggregator`}),
      cpuGridAggregator: new CPUGridAggregator({getCellSize})
    });
  }

  updateState(opts) {
    super.updateState(opts);
    const cellSizeChanged = opts.oldProps.cellSize !== opts.props.cellSize;

    if (cellSizeChanged) {
      const boundingBox = getBoundingBox(this.getAttributes(), this.getNumInstances());
      const gridOffset = getGridOffset(boundingBox, opts.props.cellSize);
      const worldOrigin = [-180, -90];
      const {yMin, yMax, xMin, xMax} = boundingBox;
      // const width = this.context.viewport.width;
      // const height = this.context.viewport.height;
      const width = xMax - xMin + gridOffset.xOffset;
      const height = yMax - yMin +  gridOffset.yOffset;

      const numCol = Math.ceil(width / gridOffset.xOffset);
      const numRow = Math.ceil(height / gridOffset.yOffset);
      const cellCount = numCol * numRow;
      const dataBytes = cellCount * 4 * 4;

      if (this.state.aggregationBuffer) {
        this.state.aggregationBuffer.delete();
      }
      this.state.aggregationBuffer = new Buffer(this.context.gl, {
        byteLength: dataBytes,
        accessor: {
          size: 4,
          type: GL.FLOAT,
          divisor: 1
        }
      });

      // NOTE: this alignment will match grid cell boundaries with existing CPU implementation
      // this gurantees identical aggregation results when switching between CPU and GPU aggregation.
      // Also gurantees same cell boundaries, when overlapping between two different layers (like ScreenGrid and Contour)
      // We first move worldOrigin to [0, 0], align the lower bounding box , then move worldOrigin to its original value.
      const originX = alignToCell(xMin - worldOrigin[0],  gridOffset.xOffset) + worldOrigin[0];
      const originY = alignToCell(yMin - worldOrigin[1],  gridOffset.yOffset) + worldOrigin[1];

      // Setup transformation matrix so that every point is in +ve range
      const gridTransformMatrix = new Matrix4().translate([-1 * originX, -1 * originY, 0]);

      this.setState({gridTransformMatrix, width, height});
    }

    const {gridTransformMatrix, width, height} = this.state;
    this.state.cpuGridAggregator.updateState(Object.assign({},opts, {
      viewport: this.context.viewport,
      attributes: this.getAttributes(),
      projectPoints: this.state.projectPoints,
      gridTransformMatrix,
      width,
      height
    }));
  }


  finalizeState() {
    super.finalizeState();
    const {gpuGridAggregator} = this.state;
    if (gpuGridAggregator) {
      gpuGridAggregator.delete();
    }
  }

  _updateShaders(shaders) {
    this.state.gpuGridAggregator.updateShaders(shaders);
  }

  _getAggregationModel() {
    return this.state.gpuGridAggregator.gridAggregationModel;
  }
}

GridAggregationLayer.layerName = 'GridAggregationLayer';
