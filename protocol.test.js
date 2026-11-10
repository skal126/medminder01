import test from 'node:test';
import assert from 'node:assert/strict';
import { compartmentToBlePayload, parseBleTelemetry } from './protocol.js';

const payloads = new Map([[1, '0'], [2, '1'], [5, '4'], [10, '9'], [13, '12']]);
for (const [compartment, expected] of payloads) {
  test(`compartment ${compartment} maps to ${expected}`, () => {
    assert.equal(compartmentToBlePayload(compartment), expected);
  });
}

for (const compartment of [0, 14, -1, 1.5, '5']) {
  test(`rejects invalid compartment ${String(compartment)}`, () => {
    assert.throws(() => compartmentToBlePayload(compartment));
  });
}

const messages = [
  ['ACK:RECEIVED:4', 'COMMAND_RECEIVED', 4],
  ['ACK:DISPENSED:4', 'DISPENSE_SEQUENCE_COMPLETED', 4],
  ['WEIGHT:0.00g', 'WEIGHT_UPDATED', 0],
  ['WEIGHT:0.45g', 'WEIGHT_UPDATED', 0.45],
  ['WEIGHT:1.25g', 'WEIGHT_UPDATED', 1.25],
  ['WEIGHT:12.50g', 'WEIGHT_UPDATED', 12.5],
  ['ALARM:CAREGIVER_ALERT', 'UNCOLLECTED_DOSE_ALERT'],
  ['ERROR', 'DEVICE_ERROR'],
];
for (const [message, type, value] of messages) {
  test(`parses ${message}`, () => {
    const event = parseBleTelemetry(message, 'device-a', 123);
    assert.equal(event.valid, true);
    assert.equal(event.type, type);
    assert.equal(event.sourceDeviceId, 'device-a');
    assert.equal(event.receiptTime, 123);
    if (value !== undefined) {
      assert.equal(message.startsWith('WEIGHT') ? event.weight : event.index, value);
    }
  });
}

for (const message of ['ACK:RECEIVED:13', 'ACK:DISPENSED:-1', 'WEIGHT:NaNg', 'WEIGHT:Infinityg', 'nonsense']) {
  test(`rejects malformed message ${message}`, () => {
    assert.equal(parseBleTelemetry(message, 'device-a').valid, false);
  });
}
