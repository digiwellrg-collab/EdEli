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

const d = (s) => new Date(s + 'T12:00:00Z');

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

test('fees by coefficient: 120k x 9 x coef', () => {
  const coef = { '101': 12.95, '201': 12.6, '202': 10.77, '203': 9.33, '301': 12.6, '302': 10.77, '303': 9.33, '401': 9.33, '402': 12.33 };
  const r = ctx.calcularCuotas_(120000, Object.entries(coef).map(([apto, c]) => ({ apto, coef: c })));
  const v = Object.fromEntries(r.map((x) => [x.apto, x.valor]));
  assert.strictEqual(v['101'], 139860);
  assert.strictEqual(v['201'], 136080);
  assert.strictEqual(v['202'], 116316);
  assert.strictEqual(v['203'], 100764);
  assert.strictEqual(v['402'], 133164);
  assert.strictEqual(r[0].nota, '$120.000 × 9 = $1.080.000 × 12,95% = $139.860');
  assert.strictEqual(ctx.parseCoef_('12,95'), 12.95);
  assert.strictEqual(ctx.parseCoef_(0.1295), 12.95);
  assert.strictEqual(ctx.parseCoef_(''), null);
});

test('payment codes make every fee unique', () => {
  const coef = { '101': 12.95, '201': 12.6, '202': 10.77, '203': 9.33, '301': 12.6, '302': 10.77, '303': 9.33, '401': 9.33, '402': 12.33 };
  const aptos = Object.entries(coef).map(([apto, c], i) => ({ apto, coef: c, codigo: i + 1 }));
  const r = ctx.calcularCuotas_(120000, aptos);
  const v = Object.fromEntries(r.map((x) => [x.apto, x.valor]));
  assert.strictEqual(JSON.stringify(v), JSON.stringify({ '101': 139861, '201': 136082, '202': 116313, '203': 100764, '301': 136085, '302': 116316, '303': 100767, '401': 100768, '402': 133169 }));
  assert.strictEqual(new Set(Object.values(v)).size, 9);
  r.forEach((x, i) => assert.strictEqual(x.valor % 10, i + 1));
  assert.ok(r[0].nota.endsWith('$139.860 → termina en 1 (código del apto): $139.861'));
  const cuotas = r.map((x) => ({ apto: x.apto, valor: x.valor }));
  assert.strictEqual(ctx.aptoPorValor_(100767, cuotas), '303');
  assert.strictEqual(ctx.aptoPorValor_(100764, cuotas), '203');
  assert.strictEqual(ctx.aptoPorValor_(100000, cuotas), '');
});

test('bank deposit goes to the oldest unpaid month', () => {
  const cuenta = { celdas: [
    { mes: '2026-08', cuota: 100, pagado: 100, conSoporte: 0 },
    { mes: '2026-09', cuota: 100, pagado: 0, conSoporte: 0 },
    { mes: '2026-10', cuota: 100, pagado: 0, conSoporte: 0 }
  ] };
  assert.strictEqual(ctx.mesPendiente_(cuenta, '2026-10', {}), '2026-09');
  assert.strictEqual(ctx.mesPendiente_(cuenta, '2026-10', { '2026-09': 100 }), '2026-10');
  assert.strictEqual(ctx.mesPendiente_(cuenta, '2026-10', { '2026-09': 100, '2026-10': 100 }), '2026-11');
  cuenta.celdas[1].conSoporte = 100;
  assert.strictEqual(ctx.mesPendiente_(cuenta, '2026-10', {}), '2026-10');
});

test('late soporte attaches to the bank-created payment', () => {
  const pagos = [
    { _fila: 2, Apto: '101', 'Fecha pago': d('2026-10-20'), Valor: 139861, Estado: 'Verificado', Soporte: 'Alerta Bancolombia', Notas: 'Creado desde alerta Bancolombia (x).' },
    { _fila: 3, Apto: '101', 'Fecha pago': d('2026-10-21'), Valor: 139861, Estado: 'Pendiente verificación', Soporte: 'https://drive/x' },
    { _fila: 4, Apto: '201', 'Fecha pago': d('2026-10-21'), Valor: 136082, Estado: 'Pendiente verificación', Soporte: 'https://drive/y' }
  ];
  const r = ctx.emparejarDuplicados_(pagos, 5).map((x) => [x.soporte._fila, x.pago._fila]);
  assert.strictEqual(JSON.stringify(r), JSON.stringify([[3, 2]]));
});

// ---- Bancolombia alerts & reconciliation ----
test('Bancolombia incoming alerts', () => {
  let a = ctx.parseAlertaBancolombia_('Bancolombia: Recibiste una transferencia por $120,000 de JUAN PEREZ en tu cuenta **1234, el 24/02/2026 a las 12:22');
  assert.deepStrictEqual({ ...a }, { ingreso: true, valor: 120000, remitente: 'JUAN PEREZ' });
  a = ctx.parseAlertaBancolombia_('Bancolombia le informa Transferencia recibida por $82.056,00 de Maria Lopez en su cuenta *1234');
  assert.strictEqual(a.ingreso, true);
  assert.strictEqual(a.valor, 82056);
  assert.strictEqual(a.remitente, 'Maria Lopez');
  a = ctx.parseAlertaBancolombia_('Bancolombia le informa Consignacion por $100.000 en su cuenta *1234');
  assert.strictEqual(a.ingreso, true);
  assert.strictEqual(a.valor, 100000);
});

test('real Bancolombia alert format', () => {
  const a = ctx.parseAlertaBancolombia_('Alertas y Notificaciones | Alertas y Notificaciones [image: Logo Bancolombia] [image: yellow-icon] ¡Listo! Todo salió bien con tus movimientos Bancolombia: Recibiste una transferencia por $1,000,000 de ALEJANDRO GOMEZ en tu cuenta **3111, el 10/12/2025 a las 11:24. Si tienes dudas, hablemos: 01 8000');
  assert.deepStrictEqual({ ...a }, { ingreso: true, valor: 1000000, remitente: 'ALEJANDRO GOMEZ' });
});

test('alert text drops image links', () => {
  const t = ctx.textoAlerta_('Alertas y Notificaciones Logo Bancolombia [https://x.s3.amazonaws.com/a.png] yellow-icon [https://x/b.png] ¡Listo! Todo salió bien con tus movimientos Bancolombia: Recibiste una transferencia por $2,500,000.00 de ALEJANDRO GOMEZ en tu cuenta **3111');
  assert.strictEqual(t, 'Bancolombia: Recibiste una transferencia por $2,500,000.00 de ALEJANDRO GOMEZ en tu cuenta **3111');
  assert.strictEqual(ctx.parseAlertaBancolombia_(t).valor, 2500000);
});

test('Bancolombia outgoing alerts are ignored', () => {
  assert.strictEqual(ctx.parseAlertaBancolombia_('Bancolombia: Compraste $50.000 en EXITO con tu T.Deb *1234').ingreso, false);
  assert.strictEqual(ctx.parseAlertaBancolombia_('Bancolombia: Transferiste $120,000 a la cuenta *9876').ingreso, false);
});

test('reconciliation pairs soporte with deposit', () => {
  const pagos = [
    { _fila: 2, Apto: '401', 'Fecha pago': d('2026-02-24'), Valor: 120000, Estado: 'Pendiente verificación' },
    { _fila: 3, Apto: '303', 'Fecha pago': d('2026-02-24'), Valor: 120000, Estado: 'Pendiente verificación' },
    { _fila: 4, Apto: '201', 'Fecha pago': d('2026-02-24'), Valor: 95000, Estado: 'Pendiente verificación' },
    { _fila: 5, Apto: '202', 'Fecha pago': d('2026-02-24'), Valor: 120000, Estado: 'Verificado' }
  ];
  const banco = [
    { _fila: 2, Fecha: d('2026-02-10'), Valor: 120000, 'Apto sugerido': '', Estado: 'Sin soporte', 'Pago vinculado': '' }, // too early
    { _fila: 3, Fecha: d('2026-02-23'), Valor: 120000, 'Apto sugerido': '303', Estado: 'Sin soporte', 'Pago vinculado': '' },
    { _fila: 4, Fecha: d('2026-02-24'), Valor: 120000, 'Apto sugerido': '', Estado: 'Sin soporte', 'Pago vinculado': '' },
    { _fila: 5, Fecha: d('2026-02-24'), Valor: 120000, 'Apto sugerido': '', Estado: 'Conciliado', 'Pago vinculado': 'x' }
  ];
  const pares = ctx.emparejar_(pagos, banco, 5).map((p) => [p.pago._fila, p.mov._fila]);
  // 401 takes the same-day deposit; 303 takes the one with its name; 201 has no matching amount.
  assert.strictEqual(JSON.stringify(pares), JSON.stringify([[2, 4], [3, 3]]));
});

test('deadline and late fee helpers', () => {
  const f = ctx.fechaLimite_('2026-02', 5);
  assert.strictEqual(f.getMonth(), 1);
  assert.strictEqual(f.getDate(), 23);
  assert.strictEqual(ctx.fechaLimite_('2026-03', 5).getDate(), 26);
  assert.strictEqual(ctx.calcularMulta_('10000', 120000), 10000);
  assert.strictEqual(ctx.calcularMulta_('2%', 120000), 2400);
  assert.strictEqual(ctx.calcularMulta_('2,5%', 100000), 2500);
  assert.strictEqual(ctx.calcularMulta_('10000', 0), 0);
  assert.strictEqual(ctx.calcularMulta_('', 120000), 0);
});

// ---- Balance math with mocked sheets ----
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

test('late fee charged the following month', () => {
  ctx.getConfig_ = () => ({ MES_INICIO: '2025-10', SALDO_INICIAL: 0, DIAS_ANTES_FIN_MES: 5, MULTA_MORA: '10000', MULTA_DESDE: '2025-11' });
  tablas.Pagos.push(
    { Apto: '402', 'Mes aplicado': '2025-11', 'Fecha pago': d('2025-11-24'), Valor: 10000, Tipo: 'Multa / interés de mora', Estado: 'Verificado' });
  const f = ctx.calcularFinanzas_('2026-01');
  const c401 = f.cuentas.find((c) => c.apto === '401');
  const cel = (c, m) => c.celdas.find((x) => x.mes === m);
  // Oct is before MULTA_DESDE: no fee in Nov.
  assert.strictEqual(cel(c401, '2025-11').multa, 0);
  // Nov: 401 paid 60k of 100k -> fee in Dec. Dec unpaid -> fee in Jan.
  assert.strictEqual(cel(c401, '2025-12').multa, 10000);
  assert.strictEqual(cel(c401, '2026-01').multa, 10000);
  const c402 = f.cuentas.find((c) => c.apto === '402');
  // 402's Nov soporte is still pending -> fee in Dec; its verified fee payment reduces debt.
  assert.strictEqual(cel(c402, '2025-12').multa, 10000);
  assert.strictEqual(cel(c402, '2025-11').pagadoMulta, 10000);
  tablas.Pagos.pop();
});

test('history levels: verified, soporte, declared', () => {
  ctx.getConfig_ = () => ({ MES_INICIO: '2025-10', SALDO_INICIAL: 0 });
  tablas.Pagos.push(
    { Apto: '401', 'Mes aplicado': '2025-12', 'Fecha pago': d('2025-12-10'), Valor: 100000, Tipo: 'Cuota ordinaria', Estado: 'Declarado (sin soporte)' });
  const f = ctx.calcularFinanzas_('2025-12');
  const cel = (a, m) => f.cuentas.find((c) => c.apto === a).celdas.find((x) => x.mes === m);
  assert.strictEqual(cel('402', '2025-11').conSoporte, 120000);
  assert.strictEqual(cel('401', '2025-12').declarado, 100000);
  assert.strictEqual(cel('401', '2025-12').pagado, 0);
  assert.strictEqual(f.cuentas.find((c) => c.apto === '401').pendiente, 100000);
  tablas.Pagos.pop();
});

test('estado de cuenta row: evidence colours, notes and both balances', () => {
  const cfg = { DIAS_ANTES_FIN_MES: 5 };
  const c = {
    saldoAnterior: 50000, pendiente: 150000, otros: 0, notas: '',
    celdas: [
      { mes: '2025-10', cuota: 100000, multa: 0, pagado: 100000, pagadoMulta: 0, conSoporte: 0, declarado: 0 },
      { mes: '2025-11', cuota: 100000, multa: 0, pagado: 0, pagadoMulta: 0, conSoporte: 100000, declarado: 0 },
      { mes: '2025-12', cuota: 100000, multa: 0, pagado: 0, pagadoMulta: 0, conSoporte: 0, declarado: 50000 },
      { mes: '2026-01', cuota: 100000, multa: 0, pagado: 0, pagadoMulta: 0, conSoporte: 0, declarado: 0 },
      { mes: '2026-02', cuota: 100000, multa: 0, pagado: 0, pagadoMulta: 0, conSoporte: 0, declarado: 0 },
      { mes: '2026-03', cuota: 100000, multa: 0, pagado: 0, pagadoMulta: 0, conSoporte: 0, declarado: 0 }
    ]
  };
  const r = ctx.filaEstado_(c, cfg, '2026-02', d('2026-02-10'));
  // March is after hoy -> not shown; February not yet due -> white.
  assert.strictEqual(JSON.stringify(r.celdas), JSON.stringify([100000, 100000, 50000, 0, 0]));
  assert.strictEqual(JSON.stringify(r.colores), JSON.stringify(['#d9ead3', '#cfe2f3', '#fff2cc', '#f4cccc', null]));
  assert.ok(r.notas[1].indexOf('Soporte por verificar') >= 0 && r.notas[3] === '');
  assert.strictEqual(r.cuotas, 400000);
  assert.strictEqual(r.debe, 50000 + 400000 - 100000);
  assert.strictEqual(r.debe - r.porVerificar, 200000);
});

test('public dashboard: building totals only, no names or per-apartment amounts', () => {
  ctx.getConfig_ = () => ({ MES_INICIO: '2025-10', SALDO_INICIAL: 0, DIAS_ANTES_FIN_MES: 5, NOMBRE_EDIFICIO: 'Edificio X' });
  tablas.Apartamentos[0].Propietario = 'Nombre Privado';
  tablas.Apartamentos[0].Notas = 'nota privada';
  const f = ctx.calcularFinanzas_('2025-12');
  const out = ctx.datosDashboard_(f, '2025-12', d('2025-12-20'));
  const json = JSON.stringify(out);
  assert.ok(json.indexOf('Nombre Privado') < 0 && json.indexOf('nota privada') < 0);
  assert.strictEqual(out.aptos, null);
  assert.strictEqual(out.kpis.aptosTotal, 2);
  assert.strictEqual(out.flujo.length, 3);
  out.recaudo.forEach((r) => assert.strictEqual(r.verificado + r.soporte + r.declarado + r.pendiente, r.esperado));
  assert.ok(out.aviso.length > 0);
  assert.strictEqual(out.composicion.categorias.length, 5);
  out.composicion.meses.forEach((m) => assert.strictEqual(m.valores.reduce((a, b) => a + b, 0), m.total));
  // Opt-in grid: states only, never amounts.
  ctx.getConfig_ = () => ({ MES_INICIO: '2025-10', SALDO_INICIAL: 0, DIAS_ANTES_FIN_MES: 5, DASHBOARD_POR_APTO: 'si', DASHBOARD_AVISO: '' });
  const g = ctx.datosDashboard_(ctx.calcularFinanzas_('2025-12'), '2025-12', d('2025-12-20'));
  assert.strictEqual(g.aviso, '');
  g.aptos.filas.forEach((r) => r.estados.forEach((e) => assert.ok(['', 'ok', 'soporte', 'declarado', 'parcial', 'pendiente', 'futuro'].indexOf(e) >= 0)));
  tablas.Apartamentos[0].Propietario = 'A';
  delete tablas.Apartamentos[0].Notas;
});

test('months without any payment reported (arrears) for the dashboard', () => {
  const cfg = { DIAS_ANTES_FIN_MES: 5 };
  const cel = (mes, o) => Object.assign({ mes, cuota: 100000, multa: 0, pagado: 0, pagadoMulta: 0, conSoporte: 0, declarado: 0 }, o || {});
  const c = { celdas: [
    cel('2025-10', { pagado: 100000 }),   // paid
    cel('2025-11', { declarado: 40000 }), // partial: not counted as arrears
    cel('2025-12'),                       // nothing reported -> arrears
    cel('2026-01', { conSoporte: 100000 }),
    cel('2026-02'),                       // nothing -> arrears
    cel('2026-03')                        // not due yet
  ] };
  const l = ctx.mesesSinPago_(c, cfg, '2026-03', d('2026-03-10'));
  assert.strictEqual(JSON.stringify(l), JSON.stringify(['2025-12', '2026-02']));
  assert.strictEqual(ctx.tramoMora_(0), 0);
  assert.strictEqual(ctx.tramoMora_(1), 1);
  assert.strictEqual(ctx.tramoMora_(3), 2);
  assert.strictEqual(ctx.tramoMora_(9), 3);

  ctx.getConfig_ = () => ({ MES_INICIO: '2025-10', SALDO_INICIAL: 0, DIAS_ANTES_FIN_MES: 5 });
  const out = ctx.datosDashboard_(ctx.calcularFinanzas_('2025-12'), '2025-12', d('2025-12-30'));
  assert.strictEqual(out.mora.reduce((s, t) => s + t.n, 0), out.kpis.aptosTotal);
  assert.strictEqual(out.moraAptos, null); // per-apartment detail is opt-in
  ctx.getConfig_ = () => ({ MES_INICIO: '2025-10', SALDO_INICIAL: 0, DIAS_ANTES_FIN_MES: 5, DASHBOARD_POR_APTO: 'SI' });
  const g = ctx.datosDashboard_(ctx.calcularFinanzas_('2025-12'), '2025-12', d('2025-12-30'));
  assert.strictEqual(g.moraAptos.length, out.kpis.aptosTotal);
  g.moraAptos.forEach((a) => assert.strictEqual(a.lista.length, a.meses));
});

test('captura grid becomes payments, credits and notes', () => {
  ctx.getConfig_ = () => ({ MES_INICIO: '2025-10', SALDO_INICIAL: 0, DIAS_ANTES_FIN_MES: 5 });
  const f = ctx.calcularFinanzas_('2025-12');
  const datos = [
    ['Apto', 'Propietario', '2025-10', '2025-11', '2025-12', 'Crédito valor', 'Crédito mes (AAAA-MM)', 'Crédito descripción', 'Nota (se guarda en Apartamentos)'],
    ['401', 'A', 'x', 'x', '90.000', '336792', '2025-12', 'Factura vencida Acuacar', 'Al día hasta dic'],
    ['402', 'B', 'x', '', 'abc', '', '', '', ''],
    ['Cómo usar: ...', '', '', '', '', '', '', '', '']
  ];
  const r = ctx.registrosCaptura_(datos, f, 'Declarado (sin soporte)', '2026-10-01');
  // Oct is already verified for 401 and 402 in the fixture -> skipped; 401 Nov is only partly paid -> recorded.
  assert.strictEqual(JSON.stringify(r.omitidos), JSON.stringify(['Apto 401 2025-10', 'Apto 402 2025-10']));
  const p401 = r.pagos.filter((p) => p.Apto === '401');
  assert.strictEqual(JSON.stringify(p401.map((p) => [p['Mes aplicado'], p.Valor, p.Tipo])), JSON.stringify([
    ['2025-11', 120000, 'Cuota ordinaria'], ['2025-12', 90000, 'Cuota ordinaria'],
    ['2025-12', 336792, 'Crédito (gasto pagado por propietario)']]));
  assert.strictEqual(r.gastos.length, 1);
  assert.strictEqual(r.gastos[0]['Categoría'], 'Agua (Acuacar)');
  assert.strictEqual(r.notas['401'], 'Al día hasta dic');
  // "abc" is reported as not understood.
  assert.strictEqual(r.pagos.filter((p) => p.Apto === '402').length, 0);
  assert.strictEqual(JSON.stringify(r.errores), JSON.stringify(['Apto 402 2025-12: "abc"']));
});

test('credits pay dues; only due months count as owed', () => {
  ctx.getConfig_ = () => ({ MES_INICIO: '2025-10', SALDO_INICIAL: 0, DIAS_ANTES_FIN_MES: 5 });
  tablas.Pagos.push({ Apto: '401', 'Mes aplicado': '2025-12', 'Fecha pago': '', Valor: 100000, Tipo: 'Crédito (gasto pagado por propietario)', Estado: 'Verificado' });
  const f = ctx.calcularFinanzas_('2025-12');
  const c = f.cuentas.find((x) => x.apto === '401');
  assert.strictEqual(c.celdas.find((x) => x.mes === '2025-12').pagado, 100000);
  assert.strictEqual(c.creditos, 100000);
  // As of 2025-11-27 only Oct and Nov are due: 120k + 120k - (120k + 60k) = 60k; Dec prepaid by credit.
  assert.strictEqual(ctx.deudaVencida_(c, f.cfg, new Date('2025-11-27T12:00:00Z')), 60000 - 100000);
  assert.strictEqual(ctx.vencido_('2025-11', f.cfg, new Date('2025-11-25T12:00:00Z')), false);
  tablas.Pagos.pop();
});

console.log(`\n${pass} passed`);
