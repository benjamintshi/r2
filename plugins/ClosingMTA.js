const _ = require('lodash');
const ss = require('simple-statistics');
const { getLogger } = require('@bitr/logger');

const precision = 3;
const sigma_power = 5.0; // 標準偏差の倍率
const profit_ratio = 0.01; // 偏差のうちNetProfitとする割合
const takeSampleCount = 200; // 使用する直近のサンプル数

class TestCalcMTA {
  // Constructor is called when initial snapshot of spread stat history has arrived.
  constructor(history) {
    this.history = _.takeRight(history, takeSampleCount);
    this.log = getLogger(this.constructor.name);
    this.profitPercentHistory = this.history.map(x => x.bestCase.profitPercentAgainstNotional);
    this.worstPercentHistory = this.history.map(x => x.worstCase.profitPercentAgainstNotional);
    this.sampleSize = this.profitPercentHistory.length;
    this.profitPercentMean = this.sampleSize != 0 ? ss.mean(this.profitPercentHistory) : 0;
    this.profitPercentVariance = this.sampleSize != 0 ? ss.variance(this.profitPercentHistory) : 0;
    this.worstPercentMean = this.sampleSiza != 0 ? ss.mean(this.worstPercentHistory) : 0;
    this.slowStart = takeSampleCount;
  }

  // The method is called each time new spread stat has arrived, by default every 3 seconds.
  // Return value: part of ConfigRoot or undefined.
  // If part of ConfigRoot is returned, the configuration will be merged. If undefined is returned, no update will be made.
  async handle(spreadStat) {
    this.history = _.tail(this.history);
    this.history.push(spreadStat);
    this.profitPercentHistory = this.history.map(x => x.bestCase.profitPercentAgainstNotional);
    this.worstPercentHistory = this.history.map(x => x.worstCase.profitPercentAgainstNotional);
    this.profitPercentMean = this.sampleSize != 0 ? ss.mean(this.profitPercentHistory) : 0;
    this.profitPercentVariance = this.sampleSize != 0 ? ss.variance(this.profitPercentHistory) : 0;
    this.worstPercentMean = this.sampleSiza != 0 ? ss.mean(this.worstPercentHistory) : 0;

    // set μ + σ to minTargetProfitPercent
    const n = this.sampleSize;
    const mean = this.profitPercentMean;
    const worstMean = this.worstPercentMean;
    const standardDeviation = Math.sqrt(this.profitPercentVariance * n/(n-1));
    let minTargetProfitPercent = _.round(
      ((mean + (standardDeviation * sigma_power)) - worstMean) / 2, precision);


    // exitNetProfitRatio by standardDeviation 
    const exitNetProfitRatio = _.round(
      standardDeviation * sigma_power * profit_ratio * 100 / minTargetProfitPercent, precision
    );

    // Slow start Protection
    if (this.slowStart > 0) {
      minTargetProfitPercent = _.round( minTargetProfitPercent + (this.slowStart-- * 0.1), precision);
    }

    // error
    if (_.isNaN(minTargetProfitPercent) || _.isNaN(exitNetProfitRatio)) {
      return undefined;
    }
    
    setTimeout(() => { 
    this.log.info(
        `μ: ${_.round(mean, precision)}, σ: ${_.round(standardDeviation, precision)
        }, n: ${n} => minTP%: ${minTargetProfitPercent} exit%R: ${exitNetProfitRatio}`
      )
    }, 25);

    // save config
    const config = { minTargetProfitPercent, exitNetProfitRatio };
    return config;
  }
}

module.exports = TestCalcMTA;
