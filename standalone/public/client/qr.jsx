import React, { useMemo } from "react";

const VERSION = 8;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 194;
const BLOCK_DATA_CODEWORDS = 97;
const ECC_CODEWORDS = 24;
const ALIGNMENT_POSITIONS = [6, 24, 42];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
let value = 1;
for (let index = 0; index < 255; index += 1) {
  EXP[index] = value;
  LOG[value] = index;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let index = 255; index < EXP.length; index += 1) EXP[index] = EXP[index - 255];

function multiply(left, right) {
  return left && right ? EXP[LOG[left] + LOG[right]] : 0;
}

function polynomialMultiply(left, right) {
  const result = new Array(left.length + right.length - 1).fill(0);
  left.forEach((leftValue, leftIndex) => right.forEach((rightValue, rightIndex) => {
    result[leftIndex + rightIndex] ^= multiply(leftValue, rightValue);
  }));
  return result;
}

function errorCorrection(data) {
  let generator = [1];
  for (let index = 0; index < ECC_CODEWORDS; index += 1) generator = polynomialMultiply(generator, [1, EXP[index]]);
  const remainder = new Array(ECC_CODEWORDS).fill(0);
  data.forEach(byte => {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let index = 0; index < ECC_CODEWORDS; index += 1) remainder[index] ^= multiply(generator[index + 1], factor);
  });
  return remainder;
}

function appendBits(bits, number, length) {
  for (let shift = length - 1; shift >= 0; shift -= 1) bits.push(Boolean((number >>> shift) & 1));
}

function encodedCodewords(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text || "")));
  if (bytes.length > 192) throw new Error("Room link is too long for the lobby QR code.");
  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach(byte => appendBits(bits, byte, 8));
  const capacity = DATA_CODEWORDS * 8;
  for (let count = 0; count < 4 && bits.length < capacity; count += 1) bits.push(false);
  while (bits.length % 8) bits.push(false);
  const data = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = byte << 1 | Number(bits[offset + bit]);
    data.push(byte);
  }
  let pad = true;
  while (data.length < DATA_CODEWORDS) {
    data.push(pad ? 0xec : 0x11);
    pad = !pad;
  }
  const blocks = [data.slice(0, BLOCK_DATA_CODEWORDS), data.slice(BLOCK_DATA_CODEWORDS)];
  const eccBlocks = blocks.map(errorCorrection);
  const codewords = [];
  for (let index = 0; index < BLOCK_DATA_CODEWORDS; index += 1) blocks.forEach(block => codewords.push(block[index]));
  for (let index = 0; index < ECC_CODEWORDS; index += 1) eccBlocks.forEach(block => codewords.push(block[index]));
  return codewords;
}

function finder(modules, row, column) {
  for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 7; columnOffset += 1) {
      const targetRow = row + rowOffset;
      const targetColumn = column + columnOffset;
      if (targetRow < 0 || targetRow >= SIZE || targetColumn < 0 || targetColumn >= SIZE) continue;
      modules[targetRow][targetColumn] = rowOffset >= 0 && rowOffset <= 6 && columnOffset >= 0 && columnOffset <= 6 && (rowOffset === 0 || rowOffset === 6 || columnOffset === 0 || columnOffset === 6 || rowOffset >= 2 && rowOffset <= 4 && columnOffset >= 2 && columnOffset <= 4);
    }
  }
}

function alignment(modules) {
  ALIGNMENT_POSITIONS.forEach(row => ALIGNMENT_POSITIONS.forEach(column => {
    if (modules[row][column] != null) return;
    for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
      for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
        modules[row + rowOffset][column + columnOffset] = Math.max(Math.abs(rowOffset), Math.abs(columnOffset)) !== 1;
      }
    }
  }));
}

function bitLength(number) {
  let length = 0;
  while (number) {
    length += 1;
    number >>>= 1;
  }
  return length;
}

function bch(number, polynomial) {
  let shifted = number << (bitLength(polynomial) - 1);
  while (bitLength(shifted) >= bitLength(polynomial)) shifted ^= polynomial << (bitLength(shifted) - bitLength(polynomial));
  return (number << (bitLength(polynomial) - 1)) | shifted;
}

function formatInfo(modules, mask) {
  const bits = bch((1 << 3) | mask, 0x537) ^ 0x5412;
  for (let index = 0; index < 15; index += 1) {
    const dark = Boolean((bits >> index) & 1);
    if (index < 6) modules[index][8] = dark;
    else if (index < 8) modules[index + 1][8] = dark;
    else modules[SIZE - 15 + index][8] = dark;
    if (index < 8) modules[8][SIZE - index - 1] = dark;
    else if (index < 9) modules[8][15 - index] = dark;
    else modules[8][15 - index - 1] = dark;
  }
  modules[SIZE - 8][8] = true;
}

function versionInfo(modules) {
  const bits = bch(VERSION, 0x1f25);
  for (let index = 0; index < 18; index += 1) {
    const dark = Boolean((bits >> index) & 1);
    modules[Math.floor(index / 3)][index % 3 + SIZE - 11] = dark;
    modules[index % 3 + SIZE - 11][Math.floor(index / 3)] = dark;
  }
}

function maskBit(mask, row, column) {
  if (mask === 0) return (row + column) % 2 === 0;
  if (mask === 1) return row % 2 === 0;
  if (mask === 2) return column % 3 === 0;
  if (mask === 3) return (row + column) % 3 === 0;
  if (mask === 4) return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
  if (mask === 5) return row * column % 2 + row * column % 3 === 0;
  if (mask === 6) return (row * column % 2 + row * column % 3) % 2 === 0;
  return (row * column % 3 + (row + column) % 2) % 2 === 0;
}

function makeMatrix(codewords, mask) {
  const modules = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
  finder(modules, 0, 0);
  finder(modules, SIZE - 7, 0);
  finder(modules, 0, SIZE - 7);
  alignment(modules);
  for (let index = 8; index < SIZE - 8; index += 1) {
    if (modules[index][6] == null) modules[index][6] = index % 2 === 0;
    if (modules[6][index] == null) modules[6][index] = index % 2 === 0;
  }
  formatInfo(modules, mask);
  versionInfo(modules);
  let row = SIZE - 1;
  let direction = -1;
  let byteIndex = 0;
  let bitIndex = 7;
  for (let column = SIZE - 1; column > 0; column -= 2) {
    if (column === 6) column -= 1;
    while (true) {
      for (let offset = 0; offset < 2; offset += 1) {
        const targetColumn = column - offset;
        if (modules[row][targetColumn] != null) continue;
        let dark = false;
        if (byteIndex < codewords.length) dark = Boolean((codewords[byteIndex] >>> bitIndex) & 1);
        if (maskBit(mask, row, targetColumn)) dark = !dark;
        modules[row][targetColumn] = dark;
        bitIndex -= 1;
        if (bitIndex < 0) {
          byteIndex += 1;
          bitIndex = 7;
        }
      }
      row += direction;
      if (row < 0 || row >= SIZE) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
  return modules;
}

function penalty(modules) {
  let score = 0;
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      let neighbours = 0;
      const dark = modules[row][column];
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (!rowOffset && !columnOffset || row + rowOffset < 0 || row + rowOffset >= SIZE || column + columnOffset < 0 || column + columnOffset >= SIZE) continue;
        if (dark === modules[row + rowOffset][column + columnOffset]) neighbours += 1;
      }
      if (neighbours > 5) score += 3 + neighbours - 5;
      if (row < SIZE - 1 && column < SIZE - 1) {
        const count = Number(dark) + Number(modules[row + 1][column]) + Number(modules[row][column + 1]) + Number(modules[row + 1][column + 1]);
        if (count === 0 || count === 4) score += 3;
      }
    }
  }
  for (let row = 0; row < SIZE; row += 1) for (let column = 0; column < SIZE - 6; column += 1) {
    if (modules[row][column] && !modules[row][column + 1] && modules[row][column + 2] && modules[row][column + 3] && modules[row][column + 4] && !modules[row][column + 5] && modules[row][column + 6]) score += 40;
  }
  for (let column = 0; column < SIZE; column += 1) for (let row = 0; row < SIZE - 6; row += 1) {
    if (modules[row][column] && !modules[row + 1][column] && modules[row + 2][column] && modules[row + 3][column] && modules[row + 4][column] && !modules[row + 5][column] && modules[row + 6][column]) score += 40;
  }
  const darkCount = modules.flat().filter(Boolean).length;
  score += Math.floor(Math.abs(100 * darkCount / SIZE / SIZE - 50) / 5) * 10;
  return score;
}

function qrMatrix(text) {
  const codewords = encodedCodewords(text);
  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const modules = makeMatrix(codewords, mask);
    const score = penalty(modules);
    if (!best || score < best.score) best = { modules, score };
  }
  return best.modules;
}

export function RoomQrCode({ value: roomLink }) {
  const matrix = useMemo(() => {
    try {
      return qrMatrix(roomLink);
    } catch (_error) {
      return qrMatrix(String(roomLink || "").split("?")[0]);
    }
  }, [roomLink]);
  const path = matrix.flatMap((row, rowIndex) => row.map((dark, columnIndex) => dark ? `M${columnIndex + 4} ${rowIndex + 4}h1v1h-1z` : "")).join("");
  return <svg className="room-qr-code" viewBox={`0 0 ${SIZE + 8} ${SIZE + 8}`} role="img" aria-label="QR code to join this room" shapeRendering="crispEdges"><rect width="100%" height="100%" rx="3" fill="#ffffff" /><path d={path} fill="#111214" /></svg>;
}

export default RoomQrCode;
