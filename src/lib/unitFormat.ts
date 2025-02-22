import dateFormat from 'dateformat';

export function byteFormat(byte: number) {
    byte = Math.round(byte);
    if (byte < 1024) {
        return `${byte}B`;
    }
    byte /= 1024;
    if (byte < 1024) {
        return `${byte.toPrecision(3)}KB`;
    }
    byte /= 1024;
    if (byte < 1024) {
        return `${byte.toPrecision(3)}MB`;
    }
    byte /= 1024;
    return `${byte.toPrecision(3)}GB`;
}

export function timeFormat(
    timeMS: number, // ms
    format: 'short' | 'long' | 'longs' | 'clock' = 'short',
    unit: 'auto' | 'second' | 'minute' | 'hour' = 'auto',
    precision: number = 4
) {
    if (unit != 'auto' && unit != 'hour' && unit != 'minute' && unit != 'second') unit = 'auto';
    let formatter: (h: number, m: number, s: number, ms: number, hh: boolean, mm: boolean, ss: boolean) => string;
    switch (format) {
        default:
        case 'short':
            formatter = timeFormatShort;
            break;
        case 'long':
            formatter = timeFormatLong;
            break;
        case 'longs':
            formatter = timeFormatLongs;
            break;
        case 'clock':
            formatter = timeFormatClock;
            break;
    }

    let extract = _extractTime(timeMS, unit);
    let topUnit: 'second' | 'minute' | 'hour' = 'hour';
    let [h, m, s, ms] = [0, 0, 0, 0];
    switch (extract.length) {
        case 4:
            topUnit = 'hour';
            [h, m, s, ms] = extract;
            break;
        case 3:
            topUnit = 'minute';
            [m, s, ms] = extract;
            break;
        case 2:
            topUnit = 'second';
            [s, ms] = extract;
            break;
    }

    switch (topUnit) {
        case 'hour':
            if (precision == 2) {
                return formatter(h, _fixed(m + s / 60, 2), 0, 0, true, true, false);
            } else if (precision <= 1) {
                return formatter(_fixed(h + m / 60, 2), 0, 0, 0, true, false, false);
            }
            return formatter(h, m, s, ms, true, true, true);
        case 'minute':
            if (precision <= 1) {
            }
            return formatter(0, m, s, ms, false, true, true);
        case 'second':
            return formatter(0, 0, s, ms, false, false, true);
    }
}

function _s(t: number) {
    return t > 1 ? 's' : '';
}

function _ms(t: number) {
    return `${t < 100 ? '0' : ''}${t < 10 ? '0' : ''}${t}`;
}

function _fixed(t: number, precision: number) {
    const pow = 10 ** precision;
    return Math.round(t * pow) / pow;
}

function _extractTime(t: number, unit: 'auto' | 'second' | 'minute' | 'hour') {
    let seconds = Math.floor(t / 1000);
    let ms = t % 1000;
    if (unit == 'second' || (unit == 'auto' && seconds < 60)) {
        return [seconds, ms];
    }
    let minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    if (unit == 'minute' || (unit == 'auto' && minutes < 60)) {
        return [minutes, seconds, ms];
    }
    let hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    return [hours, minutes, seconds, ms];
}

function timeFormatShort(h: number, m: number, s: number, ms: number, hh: boolean, mm: boolean, ss: boolean) {
    let arr: string[] = [];
    if (hh) arr.push(`${h}h`);
    if (mm) arr.push(`${m}min`);
    if (ss) arr.push(`${s}.${_ms(ms)}s`);
    return arr.join(' ');
}

function timeFormatLong(h: number, m: number, s: number, _ms: number, hh: boolean, mm: boolean, ss: boolean) {
    let arr: string[] = [];
    if (hh) arr.push(`${h} hour${_s(h)}`);
    if (mm) arr.push(`${m} minute${_s(m)}`);
    if (ss) arr.push(`${s} second${_s(s)}`);
    return arr.join(' ');
}

function timeFormatLongs(h: number, m: number, s: number, _ms: number, hh: boolean, mm: boolean, ss: boolean) {
    let arr: string[] = [];
    if (hh) arr.push(`${h} hours`);
    if (mm) arr.push(`${m} minutes`);
    if (ss) arr.push(`${s} seconds`);
    return arr.join(' ');
}

function timeFormatClock(h: number, m: number, s: number, ms: number, hh: boolean, mm: boolean, ss: boolean) {
    let arr: string[] = [];
    if (hh) arr.push(`${Math.floor(h)}`);
    if (mm) arr.push(`${Math.floor(m)}`);
    if (ss) arr.push(`${s}.${_ms(ms)}`);
    return arr.join(':');
}

export function dateTimeFormat(
    format: 'date' | 'time' | 'full',
    dateSeperator: string = '-',
    timeSeperator: string = ':',
    seperator: string = ' ',
    time?: number,
    utc?: boolean
) {
    let dateString = `yyyy'${dateSeperator}'mm'${dateSeperator}'dd`;
    let timeString = `HH'${timeSeperator}'MM'${timeSeperator}'ss`;
    let date = time || Date.now();
    switch (format) {
        case 'date':
            return dateFormat(date, dateString, utc);
        case 'time':
            return dateFormat(date, timeString, utc);
        case 'full':
        default:
            return dateFormat(date, `${dateString}${seperator}${timeString}`, utc);
    }
}
