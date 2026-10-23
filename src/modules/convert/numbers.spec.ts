import { describe, expect, it } from 'vitest';
import { absoluteDecimal, detectDecimalSeparator, isZeroDecimal, normalizeDecimal } from './numbers';

describe('normalizeDecimal', () => {
  it.each([
    ['1.5', '1.5'],
    ['0001.2300', '1.23'],
    ['+3', '3'],
    ['-0.50', '-0.5'],
    ['.5', '0.5'],
    ['5.', '5'],
    ['1,234,567.89', '1234567.89'],
    ['1 234.5', '1234.5'],
    ['1\u{A0}234.5', '1234.5'],
    ['1\'234.5', '1234.5'],
    ['$1,999.99', '1999.99'],
    ['€0.5', '0.5'],
    ['1.2E-5', '0.000012'],
    ['-3.5e3', '-3500'],
    ['2e0', '2'],
    ['123456789012345678901234.123456789012345678', '123456789012345678901234.123456789012345678'],
  ])('reads %s with a dot decimal as %s', (raw, expected) => {
    expect(normalizeDecimal(raw, '.')).toBe(expected);
  });

  it.each([
    ['1.234,56', '1234.56'],
    ['0,5', '0.5'],
    ['-12,0', '-12'],
  ])('reads %s with a comma decimal as %s', (raw, expected) => {
    expect(normalizeDecimal(raw, ',')).toBe(expected);
  });

  it.each(['', '-', 'abc', '1.2.3', '12 BTC', '1e', '--1', '1,23.5', '0.5,1'])('rejects %j with a dot decimal', (raw) => {
    expect(normalizeDecimal(raw, '.')).toBeUndefined();
  });

  it.each(['0.142857,1', '1.23,5', '1,2,3', '12.5'])('rejects %j with a comma decimal instead of guessing', (raw) => {
    expect(normalizeDecimal(raw, ',')).toBeUndefined();
  });
});

describe('decimal helpers', () => {
  it('drops the sign for the absolute value', () => {
    expect(absoluteDecimal('-1.5')).toBe('1.5');
    expect(absoluteDecimal('1.5')).toBe('1.5');
  });

  it('recognises zero', () => {
    expect(isZeroDecimal('0')).toBe(true);
    expect(isZeroDecimal('0.000')).toBe(true);
    expect(isZeroDecimal('0.001')).toBe(false);
  });
});

describe('detectDecimalSeparator', () => {
  it('picks a dot for English exports', () => {
    expect(detectDecimalSeparator(['1,234.5', '0.25', '1,000'])).toBe('.');
  });

  it('picks a comma for European exports', () => {
    expect(detectDecimalSeparator(['1.234,5', '0,25', '1.000'])).toBe(',');
  });

  it('defaults to a dot when nothing tells them apart', () => {
    expect(detectDecimalSeparator(['1,000', '12'])).toBe('.');
  });

  it('reads grouped thousands behind a currency symbol or code as grouping, not decimals', () => {
    expect(detectDecimalSeparator(['$1,000', '$2,500', '$30'])).toBe('.');
    expect(detectDecimalSeparator(['1,000 USD', '2,500 USD'])).toBe('.');
  });
});
