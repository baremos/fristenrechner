import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beendeBrowserProzess, beobachteBrowserProzess, browserProzessIdentitaet, prozessPidPruefen } from './prozessende.mjs';

const pid = 4210;
const fehler = code => Object.assign(new Error('nachgestellt'), { code });
function probe({ fehltAb = 100, endeAb = fehltAb, cdpFehler = false, closed = false,
  pidAntwort, zwangAntwort = true, nachZwang = 'ESRCH' } = {}) {
  let zeit = 0, zwang = false;
  const aufrufe = [];
  return { aufrufe,
    argumente: { child: { pid, kill: signal => {
      aufrufe.push({ signal, zeit }); zwang = true;
      if (zwangAntwort instanceof Error) throw zwangAntwort;
      return zwangAntwort;
    } }, beendet: () => zeit >= endeAb,
    browserCdp: { closed, close: () => { aufrufe.push({ trennung: true, zeit }); }, send: async (...args) => {
      aufrufe.push({ cdp: args, zeit });
      if (cdpFehler) throw new Error('CDP-Verbindung geschlossen');
    } } },
    optionen: { jetzt: () => zeit, fristMs: 200, zwangFristMs: 100, intervallMs: 50,
      warten: async ms => { zeit += ms; }, kill: (kennung, signal) => {
        assert.equal(kennung, pid); assert.equal(signal, 0);
        aufrufe.push({ pid: kennung, signal, zeit });
        const antwort = zwang ? nachZwang : pidAntwort ?? (zeit >= fehltAb ? 'ESRCH' : true);
        if (typeof antwort === 'string') throw fehler(antwort);
        return antwort;
      } },
  };
}

test('Standardfrist lässt einen späten regulären Abschluss zu; unverändert lebender Browser bleibt nach Zwang ungültig',async()=>{
  const p=probe({fehltAb:12000});delete p.optionen.fristMs;p.optionen.intervallMs=1000;
  const r=await beendeBrowserProzess(p.argumente,p.optionen);assert.equal(r.status,'bestanden');assert.equal(r.zeiten.prozessAbwesendNachMs,12000);assert.equal(r.prozessPruefung.fristMs,30000);
  const haengt=probe({fehltAb:Infinity});delete haengt.optionen.fristMs;haengt.optionen.intervallMs=1000;
  const negativ=await beendeBrowserProzess(haengt.argumente,haengt.optionen);assert.equal(negativ.status,'ungültig');assert.equal(negativ.zeiten.zwangNachMs,30000);
});

test('Endnachweis führt bekannte Nachprozesse mit ihren belegten Typen; unbekannter Typ oder vorhandene PID wird nicht geraten',async()=>{
  const p=probe({fehltAb:0});p.argumente.bekannteBrowserProzesse=[{pid:pid+1,type:'GPU'},{pid:pid+2,type:'storage.mojom.StorageService'},{pid:pid+3}];
  p.optionen.kill=(kennung,signal)=>{assert.equal(signal,0);if(kennung===pid)throw fehler('ESRCH');return true;};
  const r=await beendeBrowserProzess(p.argumente,p.optionen);assert.equal(r.status,'ungültig');
  assert.deepEqual(r.nachkommen.bekannteProzesse.map(p=>p.typen),[['GPU'],['storage.mojom.StorageService'],[]]);
  assert.ok(r.nachkommen.bekannteProzesse.every(p=>p.vorhanden===true));assert.ok(!r.zwang);
});

for (const [antwort, erwartet] of [[true, { vorhanden: true, code: null }],
  ['ESRCH', { vorhanden: false, code: 'ESRCH' }], ['EPERM', { vorhanden: true, code: 'EPERM' }]]) {
  test(`Signal 0: ${antwort} wird sprachunabhängig eingeordnet`, () => {
    assert.deepEqual(prozessPidPruefen(pid, (p, signal) => {
      assert.equal(p, pid); assert.equal(signal, 0);
      if (typeof antwort === 'string') throw fehler(antwort);
      return antwort;
    }), erwartet);
  });
}
for (const antwort of ['EACCES', 'EINVAL', false, undefined]) test(`Unbekannte Antwort ${antwort} belegt keine Abwesenheit`, () => {
  assert.equal(prozessPidPruefen(pid, () => {
    if (typeof antwort === 'string') throw fehler(antwort);
    return antwort;
  }).vorhanden, null);
});

test('Browser.close kommt vor wiederholten PID-Proben; Ende innerhalb der Frist besteht', async () => {
  const p = probe(); const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'bestanden');
  assert.deepEqual(p.aufrufe[0], { cdp: ['Browser.close', {}, 5000], zeit: 0 });
  assert.deepEqual(p.aufrufe[1], { trennung: true, zeit: 0 });
  assert.deepEqual(r.prozessPruefung.proben.map(p => p.nachMs), [0, 50, 100]);
  assert.equal(r.browserClose.prozessEndeBeobachtet, true);
  assert.ok(!p.aufrufe.some(a => a.signal === 'SIGKILL'));
});
test('ESRCH besteht auch ohne Node-exit und nach verlorener CDP-Antwort', async () => {
  const p = probe({ endeAb: Infinity, cdpFehler: true });
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'bestanden'); assert.equal(r.browserClose.bestaetigt, false);
  assert.equal(r.browserClose.prozessEndeBeobachtet, false);
  assert.match(r.browserClose.meldung, /geschlossen/);
});
test('Geschlossene CDP-Verbindung verhindert PID-Nachweis nicht', async () => {
  const p = probe({ closed: true, fehltAb: 0 });
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'bestanden'); assert.equal(r.browserClose.versucht, false);
  assert.deepEqual(p.aufrufe, [{ trennung: true, zeit: 0 }, { pid, signal: 0, zeit: 0 }]);
});
test('Bestätigtes Browser.close mit lebender PID bleibt nach wirklichem Zwang ungültig', async () => {
  const p = probe({ fehltAb: Infinity }); const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'ungültig'); assert.equal(r.prozessEndeNachZwang, true);
  assert.match(r.meldung, /zwangsweise/);
  assert.equal(p.aufrufe.find(a => a.signal === 'SIGKILL').zeit, 200);
  assert.equal(r.prozessPruefung.proben.length, 6);
});
test('EPERM ist vorhanden und wird bis zur Frist geprüft', async () => {
  const p = probe({ fehltAb: Infinity, pidAntwort: 'EPERM' });
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'ungültig'); assert.equal(r.zwang.bestaetigt, true);
  assert.equal(r.prozessPruefung.proben[4].code, 'EPERM');
});
for (const nachZwang of [true, 'EPERM', 'EACCES']) test(`Nach Zwang ist ${nachZwang} kein Endnachweis`, async () => {
  const p = probe({ fehltAb: Infinity, nachZwang });
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'ungültig'); assert.equal(r.prozessEndeNachZwang, false);
  assert.deepEqual(r.prozessPruefung.proben.slice(-3).map(p => p.nachMs), [0, 50, 100]);
});
test('Unbekannter Prüffehler verhindert Aufräumen über eigenen Prozesshandle nicht', async () => {
  const p = probe({ fehltAb: Infinity, pidAntwort: 'EACCES' });
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'ungültig'); assert.equal(r.zwang.bestaetigt, true);
  assert.equal(r.prozessPruefung.proben[0].vorhanden, null);
});
test('false vom eigenen Handle und anschließendes ESRCH bestätigen bereits erfolgtes Ende', async () => {
  const p = probe({ fehltAb: Infinity, zwangAntwort: false });
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'bestanden'); assert.equal(r.zwang.bestaetigt, false);
});
test('Zwangsfehler bleibt trotz nachfolgendem ESRCH ungültig', async () => {
  const p = probe({ fehltAb: Infinity, zwangAntwort: fehler('EPERM') });
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'ungültig'); assert.equal(r.zwang.fehler, 'EPERM');
});
for (const exitQuelle of ['exit', 'exitCode', 'signalCode']) test(`PID-Wiederverwendung nach ${exitQuelle}: keine fremde PID beenden`, async () => {
  const p = probe({ fehltAb: Infinity, endeAb: exitQuelle === 'exit' ? 0 : Infinity });
  if (exitQuelle !== 'exit') p.argumente.child[exitQuelle] = exitQuelle === 'exitCode' ? 0 : 'SIGTERM';
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'ungültig'); assert.match(r.meldung, /PID-Wiederverwendung/);
  assert.ok(!p.aufrufe.some(a => a.signal === 'SIGKILL'));
});
test('Frist mit Rest kleiner als Intervall wird nicht überschritten', async () => {
  const p = probe({ fehltAb: Infinity }); p.optionen.fristMs = 125;
  await beendeBrowserProzess(p.argumente, p.optionen);
  assert.deepEqual(p.aufrufe.filter(a => a.signal === 0).slice(0, 4).map(a => a.zeit), [0, 50, 100, 125]);
});
test('Ungültige PID ruft weder CDP noch Betriebssystem auf', async () => {
  for (const wert of [undefined, null, 0, -1, 1.5, '4210', 2147483648]) {
    const p = probe(); p.argumente.child.pid = wert;
    assert.equal((await beendeBrowserProzess(p.argumente, p.optionen)).status, 'ungültig');
    assert.deepEqual(p.aufrufe, []);
  }
});

test('Exit-Code 77 bleibt trotz ESRCH abnormal und ungültig', async () => {
  const p = probe({ fehltAb: 0 }); p.argumente.child.exitCode = 77;
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'ungültig'); assert.equal(r.exit.code, 77);
  assert.equal(r.exit.status, 'abnormal');
  assert.equal(r.nachkommen.status, 'nicht geprüft');
  assert.match(r.meldung, /abnormaler Prozessabschluss/);
});

for (const antwort of [true, 'ESRCH', 'EPERM', 'EACCES']) test(`Bekannter Nachprozess mit ${antwort} wird geprüft, niemals beendet`, async () => {
  const p = probe({ fehltAb: 0 });
  p.argumente.bekannteBrowserProzesse = [{ pid: pid + 1 }];
  p.optionen.kill = (kennung, signal) => {
    assert.equal(signal, 0);
    if (kennung === pid) throw fehler('ESRCH');
    assert.equal(kennung, pid + 1);
    if (typeof antwort === 'string') throw fehler(antwort);
    return antwort;
  };
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, antwort === 'ESRCH' ? 'bestanden' : 'ungültig');
  assert.equal(r.nachkommen.bekannteProzesse.length, 1);
  assert.equal(r.nachkommen.status, 'nicht geprüft', 'Kein vollständiger Prozessbaum behauptet');
  assert.ok(!p.aufrufe.some(a => a.signal === 'SIGKILL'));
});

test('Browser.close-Antwort allein löst den nachgestellten Transport-Wartezustand nicht; Trennung vor PID-Probe schon', async () => {
  const p = probe({ fehltAb: Infinity, endeAb: Infinity });
  let getrennt = false;
  p.argumente.browserCdp.close = () => { getrennt = true; p.aufrufe.push({ trennung: true }); };
  p.optionen.kill = () => { if (getrennt) throw fehler('ESRCH'); return true; };
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.status, 'bestanden');
  assert.equal(r.cdpTrennung.angefordert, true);
  assert.equal(r.zeiten.prozessAbwesendNachMs, 0);
  assert.equal(r.zeiten.nachZwang, false);
  assert.ok(!r.zwang);
});

test('Verlorene Browser.close-Antwort lässt die Verbindung ebenfalls vor PID-Proben schließen', async () => {
  const p = probe({ cdpFehler: true });
  const r = await beendeBrowserProzess(p.argumente, p.optionen);
  assert.equal(r.browserClose.bestaetigt, false);
  assert.equal(p.aufrufe[1].trennung, true);
  assert.equal(r.status, 'bestanden');
});

test('Auch nach gelöster Verbindung bleibt ein lebender Browser streng ungültig; Zeiten nach Zwang werden getrennt', async () => {
  const p = probe({ fehltAb: Infinity });
  const r = await beendeBrowserProzess(p.argumente, { ...p.optionen, diagnose: true });
  assert.equal(r.status, 'ungültig');
  assert.equal(r.cdpTrennung.angefordert, true);
  assert.equal(r.zeiten.zwangNachMs, 200);
  assert.equal(r.zeiten.prozessAbwesendNachMs, 200);
  assert.equal(r.zeiten.nachZwang, true);
  assert.equal(r.prozessPruefung.proben.at(-1).phase, 'nach Zwang');
  assert.equal(r.prozessPruefung.proben.at(-1).nachCloseAufrufMs, 200);
});

test('Diagnose ändert weder Frist noch Ergebnis und merkt den tatsächlichen WebSocket-close statt nur das closed-Flag', async () => {
  const ohne = probe({ fehltAb: Infinity });
  const normal = await beendeBrowserProzess(ohne.argumente, ohne.optionen);
  const mit = probe({ fehltAb: Infinity }), ws = new EventTarget();
  ws.readyState = 1;
  mit.argumente.browserCdp.ws = ws;
  const close = mit.argumente.browserCdp.close;
  mit.argumente.browserCdp.close = () => { close(); ws.readyState = 3; ws.dispatchEvent(new Event('close')); };
  const diagnostik = await beendeBrowserProzess(mit.argumente, { ...mit.optionen, diagnose: true, zustand: () => ({ netlog: 'fertig' }) });
  assert.equal(normal.diagnose, undefined);
  assert.equal(diagnostik.status, normal.status);
  assert.deepEqual(diagnostik.prozessPruefung, normal.prozessPruefung);
  assert.equal(diagnostik.zeiten.websocketEndeNachMs, 0);
  assert.equal(diagnostik.zeiten.websocketZustandAmEnde, 3);
  assert.equal(diagnostik.diagnose.filter(e => e.ereignis === 'zustand').length, 1);
});

test('CDP-Antwortzeit und anschließende PID-Wartezeit sind separat, die Gesamtdauer geht nicht verloren', async () => {
  let zeit = 0;
  const child = { pid, kill: () => { throw new Error('Kein Zwang erwartet'); } };
  const r = await beendeBrowserProzess({ child, beendet: () => false, browserCdp: {
    send: async () => { zeit = 25; }, close: () => {},
  } }, { jetzt: () => zeit, warten: async ms => { zeit += ms; }, kill: () => {
    if (zeit >= 125) throw fehler('ESRCH'); return true;
  }, fristMs: 200 });
  assert.equal(r.status, 'bestanden');
  assert.equal(r.zeiten.browserCloseAntwortNachMs, 25);
  assert.equal(r.zeiten.prozessAbwesendNachMs, 125);
  assert.equal(r.prozessPruefung.proben.at(-1).nachMs, 100);
});

test('CDP-Browser-PID muss exakt der Spawn-PID entsprechen; Renderer, Mehrdeutigkeit und fehlende Angaben genügen nicht', () => {
  assert.equal(browserProzessIdentitaet(pid, { processInfo: [{ type: 'renderer', id: 99 }, { type: 'browser', id: pid }] }).bestaetigt, true);
  for (const processInfo of [[], [{ type: 'renderer', id: pid }], [{ type: 'browser', id: pid + 1 }],
    [{ type: 'browser', id: String(pid) }], [{ type: 'browser', id: pid }, { type: 'browser', id: pid }]]) {
    assert.equal(browserProzessIdentitaet(pid, { processInfo }).bestaetigt, false);
  }
  assert.equal(browserProzessIdentitaet(pid, {}).bestaetigt, false);
});

test('Beide Pipes werden auch über Puffergröße hinaus gelesen; UTF-8, exit und geerbte offene Pipes bleiben getrennt', () => {
  const child = new EventEmitter(); child.pid = pid;
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  let zeit = 0;
  const beobachtung = beobachteBrowserProzess(child, { diagnose: true, jetzt: () => zeit });
  const bytes = Buffer.alloc(512 * 1024, 0x61);
  child.stdout.write(bytes); child.stderr.write(bytes);
  const umlaut = Buffer.from('Ä'); child.stderr.write(umlaut.subarray(0, 1)); child.stderr.write(umlaut.subarray(1));
  zeit = 10; child.emit('exit', 0, null);
  assert.equal(beobachtung.daten.stdout.bytes, bytes.length);
  assert.equal(beobachtung.daten.stderr.bytes, bytes.length + umlaut.length);
  assert.equal(beobachtung.text(), bytes.toString().repeat(2) + 'Ä');
  assert.equal(beobachtung.daten.exit.nachMs, 10);
  assert.equal(beobachtung.daten.stderr.ende, false, 'Offener geerbter Pipe-Handle ist kein lebender Hauptprozess');
  assert.equal(beobachtung.daten.close, null);
  child.stdout.destroy(); child.stderr.destroy();
});
