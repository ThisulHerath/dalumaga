import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword, validateLogin } from '../src/staff-auth';
test('passwords are salted and verification rejects invalid input', async () => {
  const a = await hashPassword('correct horse battery staple');
  const b = await hashPassword('correct horse battery staple');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('correct horse battery staple', a), true);
  assert.equal(await verifyPassword('wrong', a), false);
  assert.equal(await verifyPassword('wrong', 'broken'), false);
});
test('login input requires username and password strings', () => {
  assert.throws(() => validateLogin({ username: 'worker', password: 3 }));
  assert.deepEqual(validateLogin({ username: 'worker', password: 'secret' }), {
    username: 'worker',
    password: 'secret',
  });
});
