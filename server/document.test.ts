import assert from 'node:assert/strict'
import test from 'node:test'
import { isValidCnpj, isValidCpf, isValidCpfCnpj } from './document.js'

test('valida CPFs reais e rejeita dígitos verificadores errados ou repetidos', () => {
  assert.equal(isValidCpf('529.982.247-25'), true)
  assert.equal(isValidCpf('52998224725'), true)
  assert.equal(isValidCpf('529.982.247-26'), false)
  assert.equal(isValidCpf('111.111.111-11'), false)
  assert.equal(isValidCpf('123'), false)
})

test('valida CNPJs reais e rejeita dígitos verificadores errados ou repetidos', () => {
  assert.equal(isValidCnpj('11.222.333/0001-81'), true)
  assert.equal(isValidCnpj('11222333000181'), true)
  assert.equal(isValidCnpj('11.222.333/0001-82'), false)
  assert.equal(isValidCnpj('00.000.000/0000-00'), false)
})

test('isValidCpfCnpj decide pelo tamanho e valida o documento certo', () => {
  assert.equal(isValidCpfCnpj('529.982.247-25'), true)
  assert.equal(isValidCpfCnpj('11.222.333/0001-81'), true)
  assert.equal(isValidCpfCnpj('123456'), false)
})
