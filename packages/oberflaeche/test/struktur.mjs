import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
/** Prüft ausschließlich das ZIP-Profil unseres Schreibers, keine allgemeine ZIP-Bibliothek. */
export function leseArchiv(bytes) {
    const b = Buffer.from(bytes);
    const u16 = (p) => b.readUInt16LE(p);
    const u32 = (p) => b.readUInt32LE(p);
    const ende = b.length - 22;
    assert.equal(u32(ende), 0x06054b50, 'ZIP-Ende');
    assert.equal(u16(ende + 4), 0);
    assert.equal(u16(ende + 6), 0);
    assert.equal(u16(ende + 8), u16(ende + 10));
    assert.equal(u16(ende + 20), 0, 'kein Kommentar');
    let zentral = u32(ende + 16);
    assert.equal(zentral + u32(ende + 12), ende);
    const anfangZentral = zentral;
    let lokal = 0;
    const teile = new Map();
    for (let i = 0; i < u16(ende + 10); i++) {
        assert.equal(u32(zentral), 0x02014b50);
        const nameLaenge = u16(zentral + 28);
        const name = b.subarray(zentral + 46, zentral + 46 + nameLaenge).toString('utf8');
        assert.ok(!teile.has(name) && !name.includes('..') && !name.includes('\\') && !name.startsWith('/') && !name.endsWith('/'));
        assert.equal(u16(zentral + 4) >> 8, 0, 'Betriebssystemkennung');
        assert.equal(u16(zentral + 8), 0, 'keine Zusatzschalter');
        assert.equal(u16(zentral + 10), 8, 'deflate');
        assert.equal(u16(zentral + 12), 0, 'Zeit 00:00');
        assert.equal(u16(zentral + 14), 33, 'Datum 1980-01-01');
        for (const p of [30, 32, 34, 36])
            assert.equal(u16(zentral + p), 0);
        assert.equal(u32(zentral + 38), 0);
        assert.equal(u32(zentral + 42), lokal, 'lokale Einträge folgen unmittelbar aufeinander');
        assert.equal(u32(lokal), 0x04034b50);
        assert.equal(u16(lokal + 26), nameLaenge);
        assert.equal(u16(lokal + 28), 0);
        assert.equal(b.subarray(lokal + 30, lokal + 30 + nameLaenge).toString('utf8'), name);
        for (const [a, c, breite] of [[6, 8, 2], [8, 10, 2], [10, 12, 2], [12, 14, 2], [14, 16, 4], [18, 20, 4], [22, 24, 4]]) {
            assert.equal(breite === 2 ? u16(lokal + a) : u32(lokal + a), breite === 2 ? u16(zentral + c) : u32(zentral + c));
        }
        const start = lokal + 30 + nameLaenge;
        const gepackt = u32(zentral + 20);
        const inhalt = inflateRawSync(b.subarray(start, start + gepackt));
        assert.equal(inhalt.length, u32(zentral + 24));
        let crc = 0xffffffff;
        for (const byte of inhalt) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++)
                crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
        assert.equal((crc ^ 0xffffffff) >>> 0, u32(zentral + 16), 'CRC32');
        teile.set(name, new TextDecoder('utf-8', { fatal: true }).decode(inhalt));
        lokal = start + gepackt;
        zentral += 46 + nameLaenge;
    }
    assert.equal(lokal, anfangZentral);
    assert.equal(zentral, ende);
    return teile;
}
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const KOPF = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NAMEN = ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'docProps/app.xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/_rels/sheet1.xml.rels'];
/** Kennt nur die vom Terminplan geschriebenen Elemente und deren festen Aufbau. */
export function pruefeTerminplanTeile(teile) {
    assert.deepEqual([...teile.keys()], NAMEN);
    const teil = (name) => {
        const t = teile.get(name);
        assert.ok(t?.startsWith(KOPF), name);
        assert.doesNotMatch(t, /<!DOCTYPE|<!ENTITY|<f[ >]|<definedNames|<Application|<cp:lastModifiedBy/);
        assert.doesNotMatch(t, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/);
        assert.doesNotMatch(t, /&(?!amp;|lt;|gt;|quot;|#9;|#10;)/, 'XML-Zeichen maskiert');
        return t;
    };
    for (const name of NAMEN)
        teil(name);
    const workbook = teil('xl/workbook.xml');
    assert.match(workbook, new RegExp(`<workbook xmlns="${NS}"`));
    assert.match(workbook, /<workbookPr\/><sheets><sheet name="Terminplan" sheetId="1" r:id="rId1"\/><\/sheets><\/workbook>$/);
    const typen = teil('[Content_Types].xml');
    for (const name of NAMEN.filter(n => n.endsWith('.xml') && n !== '[Content_Types].xml')) {
        assert.ok(typen.includes(`PartName="/${name}"`), name);
    }
    assert.match(typen, /Extension="rels" ContentType="application\/vnd.openxmlformats-package.relationships\+xml"/);
    for (const [name, basis] of [['_rels/.rels', ''], ['xl/_rels/workbook.xml.rels', 'xl/']]) {
        const rels = [...teil(name).matchAll(/<Relationship Id="(rId\d+)" Type="[^"]+" Target="([^"]+)"\/>/g)];
        assert.equal(rels.length, basis ? 2 : 3);
        assert.equal(new Set(rels.map(m => m[1])).size, rels.length);
        for (const m of rels)
            assert.ok(teile.has(basis + m[2]), m[2]);
    }
    const stile = teil('xl/styles.xml');
    assert.match(stile, new RegExp(`<styleSheet xmlns="${NS}">`));
    assert.doesNotMatch(stile, /<name |<family /);
    const zahlenformate = new Map([...stile.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"\/>/g)].map(m => [+m[1], m[2]]));
    assert.equal(zahlenformate.get(164), 'dd.mm.yyyy');
    const listen = ['fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles'];
    const kinder = ['font', 'fill', 'border', 'xf', 'xf', 'cellStyle'];
    const counts = new Map();
    for (let i = 0; i < listen.length; i++) {
        const m = new RegExp(`<${listen[i]} count="(\\d+)">([\\s\\S]*?)</${listen[i]}>`).exec(stile);
        assert.ok(m);
        const n = [...m[2].matchAll(new RegExp(`<${kinder[i]}(?:[ />])`, 'g'))].length;
        assert.equal(n, +m[1]);
        counts.set(listen[i], n);
    }
    assert.ok(stile.includes('<patternFill patternType="none"/>'));
    assert.ok(stile.includes('<patternFill patternType="gray125"/>'));
    const formate = [...stile.matchAll(/<xf numFmtId="(\d+)" fontId="(\d+)" fillId="(\d+)" borderId="(\d+)" xfId="0"/g)];
    for (const m of formate) {
        assert.ok(+m[1] === 0 || zahlenformate.has(+m[1]));
        for (const [idx, name] of [[2, 'fonts'], [3, 'fills'], [4, 'borders']])
            assert.ok(+m[idx] < counts.get(name));
    }
    const blatt = teil('xl/worksheets/sheet1.xml');
    const reihenfolge = ['sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'autoFilter', 'mergeCells', 'hyperlinks', 'pageMargins', 'pageSetup', 'headerFooter'];
    let vorher = -1;
    for (const name of reihenfolge) {
        const stelle = blatt.indexOf(`<${name}`);
        assert.ok(stelle > vorher, name);
        vorher = stelle;
    }
    assert.ok(blatt.includes('<pageSetUpPr fitToPage="1"/>'));
    assert.match(blatt, /<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"\/>/);
    assert.match(blatt, /<pageMargins left="0.4" right="0.4" top="0.55" bottom="0.55" header="0.2" footer="0.2"\/>/);
    const zeilen = [...blatt.matchAll(/<row r="(\d+)"(?: ht="[\d.]+" customHeight="1")?>([\s\S]*?)<\/row>/g)];
    let letzteZeile = 0;
    const zellen = new Map();
    for (const row of zeilen) {
        assert.ok(+row[1] > letzteZeile);
        letzteZeile = +row[1];
        const matches = [...row[2].matchAll(/<c r="([A-H])(\d+)"(?: s="(\d+)")?(?:\/>|(?: t="inlineStr")?>([\s\S]*?)<\/c>)/g)];
        assert.equal(matches.map(m => m[0]).join(''), row[2]);
        assert.equal(matches.length, 8);
        matches.forEach((c, i) => {
            assert.equal(c[1], 'ABCDEFGH'[i]);
            assert.equal(c[2], row[1]);
            const stil = +(c[3] ?? 0);
            assert.ok(stil < counts.get('cellXfs'));
            const wert = c[4] ?? '';
            if (wert)
                assert.match(wert, /^(?:<v>-?\d+(?:\.\d+)?<\/v>|<is><t(?: xml:space="preserve")?>[\s\S]*<\/t><\/is>)$/);
            zellen.set(`${c[1]}${c[2]}`, { stil, wert });
        });
    }
    assert.ok(blatt.includes(`<dimension ref="A1:H${letzteZeile}"/>`));
    const merges = [...blatt.matchAll(/<mergeCell ref="([A-H])(\d+):([A-H])(\d+)"\/>/g)];
    assert.equal(merges.length, +(/<mergeCells count="(\d+)">/.exec(blatt)[1]));
    const belegt = new Set();
    for (const m of merges) {
        assert.equal(m[2], m[4]);
        const haupt = zellen.get(m[1] + m[2]);
        for (let c = m[1].charCodeAt(0); c <= m[3].charCodeAt(0); c++) {
            const ref = String.fromCharCode(c) + m[2];
            assert.ok(!belegt.has(ref), 'keine überlappenden Verbindungen');
            belegt.add(ref);
            const z = zellen.get(ref);
            assert.equal(z.stil, haupt.stil);
            if (c > m[1].charCodeAt(0))
                assert.equal(z.wert, '');
        }
    }
    const filter = /<autoFilter ref="A(\d+):H(\d+)"\/>/.exec(blatt);
    assert.ok(+filter[1] <= +filter[2]);
    assert.ok(blatt.includes(`ySplit="${filter[1]}" topLeftCell="A${+filter[1] + 1}"`));
    for (let r = +filter[1]; r <= +filter[2]; r++)
        assert.ok(!belegt.has(`A${r}`));
    const rels = teil('xl/worksheets/_rels/sheet1.xml.rels');
    const links = [...blatt.matchAll(/<hyperlink ref="([A-H]\d+)" r:id="(rId\d+)"\/>/g)];
    assert.equal(links.length, 2);
    for (const link of links) {
        assert.ok(zellen.get(link[1])?.wert);
        assert.ok(rels.includes(`Id="${link[2]}"`));
    }
    assert.equal([...rels.matchAll(/TargetMode="External"/g)].length, 2);
    assert.ok(blatt.includes('BAREMOS IT GmbH'));
    assert.ok(blatt.includes('Seite &amp;P von &amp;N'));
    return { zellen: zellen.size, zeilen: zeilen.length, stile: counts.get('cellXfs') };
}
