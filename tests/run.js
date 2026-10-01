// Runs the Apps Script code in Node with Google services mocked.
// Usage: node tests/run.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const dir = path.join(__dirname, '..', 'apps-script');
const ctx = {
  module: undefined,
  console,
  Utilities: {
    formatDate(d, tz, fmt) {
      // Good enough for tests: dates are built at noon UTC, so the Bogotá day matches.
      const p = (n) => String(n).padStart(2, '0');
      return fmt
        .replace('yyyy', d.getUTCFullYear())
        .replace('MM', p(d.getUTCMonth() + 1))
        .replace('dd', p(d.getUTCDate()))
        .replace('HH', '12').replace('mm', '00');
    }
  }
};
vm.createContext(ctx);
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).sort()) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
}

let pass = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e.message); process.exitCode = 1; }
}

// ---- Parsing ----
test('COP amounts', () => {
  assert.strictEqual(ctx.parseCOP_('$120.000'), 120000);
  assert.strictEqual(ctx.parseCOP_('1,234,567'), 1234567);
  assert.strictEqual(ctx.parseCOP_('120.000,00'), 120000);
  assert.strictEqual(ctx.parseCOP_('$ 530.000'), 530000);
  assert.strictEqual(ctx.parseCOP_('82056'), 82056);
  assert.strictEqual(ctx.parseCOP_('abc'), null);
});

test('recommended subject format', () => {
  const r = ctx.parseSoporte_('Soporte | Apto 401 | 2026-02 | 120000', '');
  assert.deepStrictEqual({ ...r }, { apto: '401', mes: '2026-02', valor: 120000 });
});

test('loose subject variants', () => {
  let r = ctx.parseSoporte_('soporte apartamento #302 febrero 2026 $120.000', '');
  assert.deepStrictEqual({ ...r }, { apto: '302', mes: '2026-02', valor: 120000 });
  r = ctx.parseSoporte_('Soporte pago', 'Hola, adjunto el pago del apto 201 de octubre de 2025 por $ 120.000. Gracias');
  assert.deepStrictEqual({ ...r }, { apto: '201', mes: '2025-10', valor: 120000 });
  r = ctx.parseSoporte_('Soporte #303 02/2026 82.056', '');
  assert.deepStrictEqual({ ...r }, { apto: '303', mes: '2026-02', valor: 82056 });
  r = ctx.parseSoporte_('Soporte Apto. 402 - Sept 2026 - 120000', '');
  assert.strictEqual(r.mes, '2026-09');
});

test('missing fields come back null', () => {
  const r = ctx.parseSoporte_('Soporte', 'adjunto');
  assert.deepStrictEqual({ ...r }, { apto: null, mes: null, valor: null });
});

test('utility invoice totals', () => {
  assert.strictEqual(ctx.parseMontoFactura_('Su factura. Total a pagar: $ 530.000 Fecha límite 15'), 530000);
  assert.strictEqual(ctx.parseMontoFactura_('VALOR A PAGAR $200.450,00'), 200450);
  assert.strictEqual(ctx.parseMontoFactura_('Hola, su factura esta disponible'), null);
});

test('month helpers', () => {
  assert.strictEqual(ctx.sumarMeses_('2025-12', 1), '2026-01');
  assert.strictEqual(ctx.sumarMeses_('2026-01', -1), '2025-12');
  assert.deepStrictEqual([...ctx.listaMeses_('2025-10', '2026-01')], ['2025-10', '2025-11', '2025-12', '2026-01']);
  assert.strictEqual(ctx.nombreMes_('2026-02'), 'Febrero 2026');
  assert.strictEqual(ctx.formatoCOP_(-1234567), '-$1.234.567');
});

// ---- Balance math with mocked sheets ----
const d = (s) => new Date(s + 'T12:00:00Z');
const tablas = {
  Apartamentos: [
    { Apto: '401', Propietario: 'A', 'Saldo anterior': 0, Activo: 'SI' },
    { Apto: '402', Propietario: 'B', 'Saldo anterior': 50000, Activo: 'SI' }
  ],
  Cuotas: [
    { Apto: '401', Desde: '2025-10', 'Cuota mensual': 120000 },
    { Apto: '402', Desde: '2025-10', 'Cuota mensual': 120000 },
    { Apto: '401', Desde: '2025-12', 'Cuota mensual': 100000 }
  ],
  Pagos: [
    { Apto: '401', 'Mes aplicado': '2025-10', 'Fecha pago': d('2025-10-05'), Valor: 120000, Tipo: 'Cuota ordinaria', Estado: 'Verificado' },
    { Apto: '402', 'Mes aplicado': '2025-10', 'Fecha pago': d('2025-11-02'), Valor: 120000, Tipo: 'Cuota ordinaria', Estado: 'Verificado' },
    { Apto: '401', 'Mes aplicado': '2025-11', 'Fecha pago': d('2025-11-03'), Valor: 60000, Tipo: 'Cuota ordinaria', Estado: 'Verificado' },
    { Apto: '401', 'Mes aplicado': '2025-11', 'Fecha pago': d('2025-11-03'), Valor: 30000, Tipo: 'Aporte voluntario', Estado: 'Verificado' },
    { Apto: '402', 'Mes aplicado': '2025-11', 'Fecha pago': d('2025-11-20'), Valor: 120000, Tipo: 'Cuota ordinaria', Estado: 'Pendiente verificación' }
  ],
  Gastos: [
    { Mes: '2025-10', 'Fecha pago': d('2025-10-20'), 'Categoría': 'Energía (Afinia)', Valor: 80000, Estado: 'Pagado' },
    { Mes: '2025-10', 'Fecha pago': '', 'Categoría': 'Aseo', Valor: 150000, Estado: 'Pagado' },
    { Mes: '2025-11', 'Fecha pago': '', 'Categoría': 'Agua (Acuacar)', Valor: 200000, Estado: 'Por pagar' }
  ]
};
ctx.getConfig_ = () => ({ MES_INICIO: '2025-10', SALDO_INICIAL: 500000, VALOR_ASEO: 150000 });
ctx.leerTabla_ = (n) => ({ filas: tablas[n].map((f) => ({ ...f })) });

test('running balance carries month to month', () => {
  const f = ctx.calcularFinanzas_('2025-12');
  const [oct, nov, dic] = f.porMes;
  assert.strictEqual(oct.mes, '2025-10');
  assert.strictEqual(oct.saldoInicial, 500000);
  assert.strictEqual(oct.ingresos, 120000);
  assert.strictEqual(oct.gastos, 230000);
  assert.strictEqual(oct.saldoFinal, 390000);
  assert.strictEqual(nov.saldoInicial, 390000);
  assert.strictEqual(nov.ingresosCuotas, 180000); // 402's Oct dues paid in Nov + 401 partial
  assert.strictEqual(nov.ingresosOtros, 30000);
  assert.strictEqual(nov.porVerificar, 120000);
  assert.strictEqual(nov.porPagar, 200000);
  assert.strictEqual(nov.saldoFinal, 600000);
  assert.strictEqual(dic.saldoInicial, 600000);
});

test('per-apartment debt uses dated fee changes', () => {
  const f = ctx.calcularFinanzas_('2025-12');
  const c401 = f.cuentas.find((c) => c.apto === '401');
  const c402 = f.cuentas.find((c) => c.apto === '402');
  assert.strictEqual(f.cuotaDe('401', '2025-11'), 120000);
  assert.strictEqual(f.cuotaDe('401', '2025-12'), 100000);
  // 401: owed 120k+120k+100k, paid 120k+60k -> 160k
  assert.strictEqual(ctx.deudaHasta_(c401, '2025-12'), 160000);
  // 402: 50k prior + 360k owed - 120k verified (Nov payment still pending)
  assert.strictEqual(ctx.deudaHasta_(c402, '2025-12'), 290000);
  assert.strictEqual(c402.pendiente, 120000);
  assert.strictEqual(c401.otros, 30000);
});

console.log(`\n${pass} passed`);
