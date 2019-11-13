// Copyright (c) 2015 - 2018 Uber Technologies, Inc.
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

const defaultGetCellSize = props => props.cellSize;
export default class CPUAggregator {
  constructor(opts) {
    this.setState({
      layerData: {}
    });
    this.changeFlags = {};

    this._getCellSize = opts.getCellSize || defaultGetCellSize;
    this._getAggregator = opts.getAggregator;
  }

  updateState(opts) {
    const {oldProps, props, changeFlags, viewport, attributes} = opts;
    const reprojectNeeded = this.needsReProjectPoints(oldProps, props, changeFlags);

    if (changeFlags.dataChanged || reprojectNeeded) {
      // project data into hexagons, and get sortedColorBins
      this.getAggregatedData(props, viewport, attributes);
    }

    return this.state;
  }

  normalizeResult(result = {}) {
    return result;
  }

  // Update private state
  setState(updateObject) {
    this.state = Object.assign({}, this.state, updateObject);
  }

  getAggregatedData(props, viewport, attributes) {
    const aggregator = this._getAggregator(props);

    // result should contain a data array and other props
    // result = {data: [], ...other props}
    // const opts = Object.assign({}, props, {viewport, attributes});
    // const {cellSize, data, getPosition} = props;
    const result = aggregator({
      cellSize: this._getCellSize(props),
      data: props.data,
      viewport,
      attributes
      // getPosition: props.getPosition
    });
    this.setState({
      layerData: this.normalizeResult(result)
    });
    // TODO: where is this used?
    this.changeFlags = {
      layerData: true
    };
  }

  needsReProjectPoints(oldProps, props, changeFlags) {
    return (
      this._getCellSize(oldProps) !== this._getCellSize(props) ||
      this._getAggregator(oldProps) !== this._getAggregator(props) ||
      (changeFlags.updateTriggersChanged &&
        (changeFlags.updateTriggersChanged.all || changeFlags.updateTriggersChanged.getPosition))
    );
  }

  getPickingInfo({info}) {
    // TODO: return picking info relevant to SG/Contour/GPUGrid layers?
  }
}
