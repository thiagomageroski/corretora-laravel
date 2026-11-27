/**
 * Technical indicators as pure functions over real price series. Every result
 * has the input's length, with null wherever there is not enough history yet.
 */
export type Series = (number | null)[];

export type Bar = { high: number; low: number; close: number };

export function sma(values: number[], period: number): Series {
    let sum = 0;

    return values.map((value, index) => {
        sum += value;

        if (index >= period) {
            sum -= values[index - period];
        }

        return index >= period - 1 ? sum / period : null;
    });
}

/**
 * Exponential moving average seeded with the SMA of the first period.
 */
export function ema(values: number[], period: number): Series {
    const multiplier = 2 / (period + 1);
    const result: Series = new Array(values.length).fill(null);

    if (values.length < period) {
        return result;
    }

    let previous = values.slice(0, period).reduce((total, value) => total + value, 0) / period;
    result[period - 1] = previous;

    for (let index = period; index < values.length; index++) {
        previous = (values[index] - previous) * multiplier + previous;
        result[index] = previous;
    }

    return result;
}

/**
 * Relative Strength Index with Wilder's smoothing.
 */
export function rsi(values: number[], period = 14): Series {
    const result: Series = new Array(values.length).fill(null);

    if (values.length <= period) {
        return result;
    }

    let averageGain = 0;
    let averageLoss = 0;

    for (let index = 1; index <= period; index++) {
        const change = values[index] - values[index - 1];
        averageGain += Math.max(change, 0);
        averageLoss += Math.max(-change, 0);
    }

    averageGain /= period;
    averageLoss /= period;

    const toRsi = (): number => {
        if (averageLoss === 0) {
            return averageGain === 0 ? 50 : 100;
        }

        return 100 - 100 / (1 + averageGain / averageLoss);
    };

    result[period] = toRsi();

    for (let index = period + 1; index < values.length; index++) {
        const change = values[index] - values[index - 1];
        averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
        averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
        result[index] = toRsi();
    }

    return result;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): { macd: Series; signal: Series; histogram: Series } {
    const fastEma = ema(values, fast);
    const slowEma = ema(values, slow);
    const line: Series = values.map((_, index) => {
        const fastValue = fastEma[index];
        const slowValue = slowEma[index];

        return fastValue === null || slowValue === null ? null : fastValue - slowValue;
    });

    const firstDefined = line.findIndex((value) => value !== null);
    const signal: Series = new Array(values.length).fill(null);

    if (firstDefined !== -1) {
        ema(line.slice(firstDefined) as number[], signalPeriod).forEach((value, offset) => {
            signal[firstDefined + offset] = value;
        });
    }

    const histogram: Series = line.map((value, index) => {
        const signalValue = signal[index];

        return value === null || signalValue === null ? null : value - signalValue;
    });

    return { macd: line, signal, histogram };
}

/**
 * Bollinger Bands using the population standard deviation, as John Bollinger defines them.
 */
export function bollinger(values: number[], period = 20, deviations = 2): { upper: Series; middle: Series; lower: Series } {
    const middle = sma(values, period);
    const upper: Series = new Array(values.length).fill(null);
    const lower: Series = new Array(values.length).fill(null);

    middle.forEach((mean, index) => {
        if (mean === null) {
            return;
        }

        const window = values.slice(index - period + 1, index + 1);
        const variance = window.reduce((total, value) => total + (value - mean) ** 2, 0) / period;
        const distance = Math.sqrt(variance) * deviations;
        upper[index] = mean + distance;
        lower[index] = mean - distance;
    });

    return { upper, middle, lower };
}

/**
 * Slow stochastic oscillator: %K smoothed by smoothK, %D as the SMA of %K.
 */
export function stochastic(bars: Bar[], period = 14, smoothK = 3, smoothD = 3): { k: Series; d: Series } {
    const raw: Series = bars.map((bar, index) => {
        if (index < period - 1) {
            return null;
        }

        const window = bars.slice(index - period + 1, index + 1);
        const highest = Math.max(...window.map((item) => item.high));
        const lowest = Math.min(...window.map((item) => item.low));

        return highest === lowest ? 50 : ((bar.close - lowest) / (highest - lowest)) * 100;
    });

    const smooth = (series: Series, length: number): Series => {
        const firstDefined = series.findIndex((value) => value !== null);
        const result: Series = new Array(series.length).fill(null);

        if (firstDefined !== -1) {
            sma(series.slice(firstDefined) as number[], length).forEach((value, offset) => {
                result[firstDefined + offset] = value;
            });
        }

        return result;
    };

    const k = smooth(raw, smoothK);

    return { k, d: smooth(k, smoothD) };
}

export const FIBONACCI_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export function fibonacciLevels(from: number, to: number): { ratio: number; price: number }[] {
    return FIBONACCI_RATIOS.map((ratio) => ({ ratio, price: to - (to - from) * ratio }));
}
