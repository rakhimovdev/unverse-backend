const READING_ACADEMIC_TABLE = [
    { min: 39, max: 40, band: 9 },
    { min: 37, max: 38, band: 8.5 },
    { min: 35, max: 36, band: 8 },
    { min: 33, max: 34, band: 7.5 },
    { min: 30, max: 32, band: 7 },
    { min: 27, max: 29, band: 6.5 },
    { min: 23, max: 26, band: 6 },
    { min: 19, max: 22, band: 5.5 },
    { min: 15, max: 18, band: 5 },
    { min: 12, max: 14, band: 4.5 },
    { min: 9, max: 11, band: 4 },
    { min: 5, max: 8, band: 3 },
    { min: 0, max: 4, band: 0 }
];

const READING_GENERAL_TABLE = [
    { min: 39, max: 40, band: 9 },
    { min: 38, max: 38, band: 8.5 },
    { min: 37, max: 37, band: 8 },
    { min: 36, max: 36, band: 7.5 },
    { min: 34, max: 35, band: 7 },
    { min: 32, max: 33, band: 6.5 },
    { min: 30, max: 31, band: 6 },
    { min: 27, max: 29, band: 5.5 },
    { min: 23, max: 26, band: 5 },
    { min: 19, max: 22, band: 4.5 },
    { min: 15, max: 18, band: 4 },
    { min: 12, max: 14, band: 3 },
    { min: 0, max: 11, band: 0 }
];

const LISTENING_BAND_TABLE = [
    { min: 39, max: 40, band: 9 },
    { min: 37, max: 38, band: 8.5 },
    { min: 35, max: 36, band: 8 },
    { min: 32, max: 34, band: 7.5 },
    { min: 30, max: 31, band: 7 },
    { min: 26, max: 29, band: 6.5 },
    { min: 23, max: 25, band: 6 },
    { min: 18, max: 22, band: 5.5 },
    { min: 16, max: 17, band: 5 },
    { min: 13, max: 15, band: 4.5 },
    { min: 10, max: 12, band: 4 },
    { min: 6, max: 9, band: 3.5 },
    { min: 4, max: 5, band: 3 },
    { min: 2, max: 3, band: 2.5 },
    { min: 1, max: 1, band: 1 },
    { min: 0, max: 0, band: 0 }
];

const getBandScore = (rawScore, table) => {
    const value = Number(rawScore);
    if (!Number.isFinite(value)) return null;
    const row = table.find((item) => value >= item.min && value <= item.max);
    return row ? row.band : null;
};

const roundToHalfBand = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.round(num * 2) / 2;
};

const averageBands = (bands = []) => {
    const values = bands.map(Number).filter(Number.isFinite);
    if (!values.length) return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    return roundToHalfBand(total / values.length);
};

module.exports = {
    READING_ACADEMIC_TABLE,
    READING_GENERAL_TABLE,
    LISTENING_BAND_TABLE,
    getBandScore,
    roundToHalfBand,
    averageBands
};
