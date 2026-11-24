import test from 'node:test';
import assert from 'node:assert/strict';
import { es } from 'date-fns/locale';

import { parseLocalDate, formatLocalDate, getGanadoDateError } from '../src/utils/dateUtils';
import { sanitizeDecimalInput, parseDecimalInput } from '../src/utils/decimalInput';
import { isStrongPassword, evaluatePasswordRequirements } from '../src/utils/passwordUtils';
import {
  toDisplayValue,
  toStorageValue,
  getGmpRgb,
  calcularDiasEntreFechas,
  esPesajePosteriorAIngreso,
  calcularGmpUltimoPeriodo,
  calcularPesoEstimadoHoy,
} from '../src/utils/ganancia';
import { calculateWeighingHistoryChain } from '../src/utils/gananciaRecalculator';

test('Fechas UTC-5: parseLocalDate y formatLocalDate nunca desplazan al día anterior', () => {
  const d = parseLocalDate('2026-05-01');
  assert.ok(d);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 4);
  assert.equal(d.getDate(), 1);

  assert.equal(formatLocalDate('2026-05-01', 'dd/MM/yyyy'), '01/05/2026');
  assert.equal(formatLocalDate('2026-05-01T00:00:00Z', 'dd/MM/yyyy'), '01/05/2026');
  assert.equal(formatLocalDate('2026-05-01', 'MMM yyyy', { locale: es }).toLowerCase(), 'may 2026');
  assert.equal(formatLocalDate(null, 'dd/MM/yyyy', { fallback: 'Sin fecha' }), 'Sin fecha');
});

test('Cálculo de días calendario exactos sin desfase de zona horaria', () => {
  assert.equal(calcularDiasEntreFechas('2026-05-01', '2026-05-31'), 30);
  assert.equal(calcularDiasEntreFechas('2026-05-01T00:00:00Z', '2026-05-01'), 0);
  assert.equal(esPesajePosteriorAIngreso('2026-05-01', '2026-05-01'), false);
  assert.equal(esPesajePosteriorAIngreso('2026-05-02', '2026-05-01'), true);
});

test('Validación de fechas ganaderas rechaza fechas vacías o anteriores a 2000', () => {
  assert.ok(getGanadoDateError('', 'Fecha'));
  assert.ok(getGanadoDateError('1999-12-31', 'Fecha'));
  assert.ok(getGanadoDateError('2026-02-30', 'Fecha'));
  assert.equal(getGanadoDateError('2026-11-24', 'Fecha'), null);
});

test('Entradas decimales con coma (es-CO) y punto funcionan en reportes y pesajes', () => {
  assert.equal(sanitizeDecimalInput('250,5kg'), '250,5');
  assert.equal(parseDecimalInput('250,5'), 250.5);
  assert.equal(parseDecimalInput('410.75'), 410.75);
  assert.ok(Number.isNaN(parseDecimalInput('')));
});

test('Política de contraseñas exige mínimo 8 caracteres, mayúscula, minúscula y símbolo', () => {
  assert.equal(isStrongPassword('123456'), false);
  assert.equal(isStrongPassword('Abcdefgh'), false);
  assert.equal(isStrongPassword('Abcdefg1'), false);
  assert.equal(isStrongPassword('Ganado2026!'), true);
  assert.deepEqual(evaluatePasswordRequirements('Ganado2026!'), {
    minLength: true,
    hasUpper: true,
    hasLower: true,
    hasSpecial: true,
  });
});

test('Conversión GMP/GDP y semáforo PDF mantienen coherencia en ambos modos', () => {
  // 150 gr/día = 4.5 kg/mes (por debajo de umbralMedio=10 -> naranja [255, 152, 0])
  const gdpDisplayPobre = toDisplayValue(4.5, 'GDP');
  assert.equal(Math.round(gdpDisplayPobre), 150);
  const gmpReconstruido = toStorageValue(Number(gdpDisplayPobre.toFixed(0)), 'GDP');
  assert.deepEqual(getGmpRgb(gmpReconstruido, 10, 20), [255, 152, 0]);

  // 750 gr/día = 22.5 kg/mes (por encima de umbralAlto=20 -> verde [76, 175, 80])
  const gdpDisplayBueno = toDisplayValue(22.5, 'GDP');
  const gmpBueno = toStorageValue(Number(gdpDisplayBueno.toFixed(0)), 'GDP');
  assert.deepEqual(getGmpRgb(gmpBueno, 10, 20), [76, 175, 80]);
});

test('Recalculador en cascada actualiza peso_anterior, gdp y gmp tras ediciones o fechas retroactivas', () => {
  const chain = calculateWeighingHistoryChain(200, '2026-01-01', [
    { id: 'p2', fecha: '2026-03-02', peso: 230 }, // 30 días después de p1 -> +15 kg -> gdp 0.5, gmp 15
    { id: 'p1', fecha: '2026-01-31', peso: 215 }, // 30 días después ingreso -> +15 kg -> gdp 0.5, gmp 15
    { id: 'p0', fecha: '2026-01-01', peso: 200 }, // mismo día de ingreso -> gdp 0, gmp 0
  ]);

  assert.equal(chain.length, 3);
  assert.equal(chain[0].id, 'p0');
  assert.equal(chain[0].gdp_calculada, 0);
  assert.equal(chain[1].id, 'p1');
  assert.equal(chain[1].peso_anterior, 200);
  assert.equal(chain[1].gdp_calculada, 0.5);
  assert.equal(chain[1].gmp_calculada, 15);
  assert.equal(chain[2].id, 'p2');
  assert.equal(chain[2].peso_anterior, 215);
  assert.equal(chain[2].gdp_calculada, 0.5);
  assert.equal(chain[2].gmp_calculada, 15);
});

test('calcularGmpUltimoPeriodo y estimación zootécnica ignoran pesajes del mismo día de ingreso', () => {
  assert.equal(
    calcularGmpUltimoPeriodo({ fecha: '2026-01-01', peso: 210, gmp_calculada: 0 }, '2026-01-01', 210),
    null
  );
  const gmpReal = calcularGmpUltimoPeriodo(
    { fecha: '2026-02-01', peso: 231, gmp_calculada: 20.3226 },
    '2026-01-01',
    210
  );
  assert.equal(gmpReal, 20.3226);

  const est = calcularPesoEstimadoHoy({
    etapa: 'levante',
    fecha_ingreso: '2026-09-01',
    peso_ingreso: 240,
    registros_pesaje: [{ fecha: '2026-10-01', peso: 255, gmp_calculada: 15 }],
  });
  assert.ok(est.pesoEstimado >= 255);
  assert.equal(est.pesoActual, 255);
});
