// Prueft installierte Pakete des Android SDK gegen die festgelegten Revisionen.
//
// Aufruf:
//   java scripts/SdkPruefung.java <SDK> <Paket> <Ordner> <Revision> [<Paket> <Ordner> <Revision> ...]
//
// Einrichtungsskript und Build-Skript rufen dieses Programm mit dem JDK auf, das
// sie fuer den Build ohnehin suchen. So gibt es eine einzige Umsetzung, und
// package.xml liest der XML-Leser des JDK.
//
// Ausgabe: je Paket eine Zeile, vier Felder, mit Tabulator getrennt:
//   Status, Paket, gefundene Revision, Meldung
// Status: OK, ABWEICHUNG, FEHLT oder UNGUELTIG.
// Die Ausgabe enthaelt nur ASCII. Andere Zeichen erscheinen als \\uXXXX.
//
// package.xml schreibt das Installationswerkzeug aus der Paketliste von Google.
// source.properties stammt aus dem Archiv und nennt bei einzelnen Paketen einen
// aelteren Stand. Die Datei gilt deshalb nur, wenn package.xml fehlt.
// Eine vorhandene Beschreibung, die unlesbar ist oder ein anderes Paket nennt,
// macht das Paket ungueltig. Es gibt dann keinen Rueckgriff auf die andere Datei.
//
// Die Datei enthaelt bewusst nur ASCII-Zeichen.

import java.io.IOException;
import java.io.InputStream;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.ErrorHandler;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

public class SdkPruefung {

    static class Ungueltig extends Exception {
        Ungueltig(String meldung) {
            super(meldung);
        }
    }

    public static void main(String[] args) {
        if (args.length < 4 || (args.length - 1) % 3 != 0) {
            System.err.println("Aufruf: java SdkPruefung.java <SDK> <Paket> <Ordner> <Revision> ...");
            System.exit(2);
        }
        StringBuilder ausgabe = new StringBuilder();
        try {
            Path sdk = Path.of(args[0]);
            for (int i = 1; i < args.length; i += 3) {
                String paket = args[i];
                String soll = args[i + 2];
                String status;
                String gefunden = "";
                String meldung = "";
                try {
                    String revision = revision(sdk.resolve(args[i + 1]), paket);
                    if (revision == null) {
                        status = "FEHLT";
                    } else {
                        gefunden = revision;
                        status = gleich(revision, soll) ? "OK" : "ABWEICHUNG";
                    }
                } catch (Ungueltig fehler) {
                    status = "UNGUELTIG";
                    meldung = fehler.getMessage();
                }
                ausgabe.append(status).append('\t').append(ascii(paket)).append('\t')
                        .append(ascii(gefunden)).append('\t').append(ascii(meldung)).append('\n');
            }
        } catch (RuntimeException | ParserConfigurationException fehler) {
            System.err.println("Die Pruefung ist fehlgeschlagen: " + ascii(String.valueOf(fehler)));
            System.exit(2);
        }
        System.out.print(ausgabe);
    }

    // Liefert die Revision des Pakets im Ordner oder null, wenn es fehlt.
    static String revision(Path ordner, String paket) throws Ungueltig, ParserConfigurationException {
        Path xml = ordner.resolve("package.xml");
        if (Files.exists(xml)) {
            return ausXml(xml, paket);
        }
        Path eigenschaften = ordner.resolve("source.properties");
        if (Files.exists(eigenschaften)) {
            return ausEigenschaften(eigenschaften, paket);
        }
        return null;
    }

    static String ausXml(Path datei, String paket) throws Ungueltig, ParserConfigurationException {
        DocumentBuilderFactory fabrik = DocumentBuilderFactory.newInstance();
        fabrik.setNamespaceAware(true);
        fabrik.setXIncludeAware(false);
        fabrik.setExpandEntityReferences(false);
        fabrik.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        fabrik.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        DocumentBuilder leser = fabrik.newDocumentBuilder();
        leser.setErrorHandler(new ErrorHandler() {
            public void warning(SAXParseException fehler) {
            }

            public void error(SAXParseException fehler) throws SAXException {
                throw fehler;
            }

            public void fatalError(SAXParseException fehler) throws SAXException {
                throw fehler;
            }
        });
        Document dokument;
        try (InputStream strom = Files.newInputStream(datei)) {
            dokument = leser.parse(strom);
        } catch (SAXException fehler) {
            throw new Ungueltig("package.xml ist kein gueltiges XML.");
        } catch (IOException fehler) {
            throw new Ungueltig("package.xml ist nicht lesbar.");
        }

        List<Element> pakete = kinder(dokument.getDocumentElement(), "localPackage");
        if (pakete.size() != 1) {
            throw new Ungueltig("package.xml beschreibt nicht genau ein Paket.");
        }
        if (!pakete.get(0).hasAttributeNS(null, "path")) {
            throw new Ungueltig("package.xml nennt keine Paketkennung.");
        }
        String kennung = pakete.get(0).getAttributeNS(null, "path");
        if (!kennung.equals(paket)) {
            throw new Ungueltig("package.xml beschreibt '" + kennung + "'.");
        }
        List<Element> revisionen = kinder(pakete.get(0), "revision");
        if (revisionen.size() != 1) {
            throw new Ungueltig("package.xml nennt nicht genau eine Revision.");
        }
        Element revision = revisionen.get(0);
        String text = feld(revision, "major", null) + "." + feld(revision, "minor", "0") + "."
                + feld(revision, "micro", "0");
        String vorschau = feld(revision, "preview", "");
        return vorschau.isEmpty() ? text : text + " rc" + vorschau;
    }

    // Kindelemente mit diesem Namen, die keinem Namensraum angehoeren.
    static List<Element> kinder(Element element, String name) {
        List<Element> treffer = new ArrayList<>();
        for (Node kind = element.getFirstChild(); kind != null; kind = kind.getNextSibling()) {
            if (kind.getNodeType() == Node.ELEMENT_NODE && kind.getNamespaceURI() == null
                    && name.equals(kind.getLocalName())) {
                treffer.add((Element) kind);
            }
        }
        return treffer;
    }

    // Liest ein Zahlenfeld der Revision. Fehlt es, gilt der Ersatzwert.
    // Ohne Ersatzwert ist das Feld Pflicht.
    static String feld(Element revision, String name, String ersatz) throws Ungueltig {
        List<Element> treffer = kinder(revision, name);
        if (treffer.isEmpty()) {
            if (ersatz == null) {
                throw new Ungueltig("Feld " + name + " fehlt.");
            }
            return ersatz;
        }
        if (treffer.size() > 1) {
            throw new Ungueltig("Feld " + name + " ist mehrfach vorhanden.");
        }
        StringBuilder inhalt = new StringBuilder();
        for (Node kind = treffer.get(0).getFirstChild(); kind != null; kind = kind.getNextSibling()) {
            if (kind.getNodeType() != Node.TEXT_NODE) {
                throw new Ungueltig("Feld " + name + " ist keine Zahl.");
            }
            inhalt.append(kind.getNodeValue());
        }
        String wert = ohneLeerraum(inhalt.toString());
        if (!wert.matches("[0-9]+")) {
            throw new Ungueltig("Feld " + name + " ist keine Zahl.");
        }
        return new BigInteger(wert).toString();
    }

    // Entfernt Leerraum nach der Festlegung von XML an beiden Enden.
    static String ohneLeerraum(String text) {
        int von = 0;
        int bis = text.length();
        while (von < bis && " \t\r\n".indexOf(text.charAt(von)) >= 0) {
            von++;
        }
        while (bis > von && " \t\r\n".indexOf(text.charAt(bis - 1)) >= 0) {
            bis--;
        }
        return text.substring(von, bis);
    }

    static String ausEigenschaften(Path datei, String paket) throws Ungueltig {
        Properties eigenschaften = new Properties();
        try (InputStream strom = Files.newInputStream(datei)) {
            eigenschaften.load(strom);
        } catch (IOException | IllegalArgumentException fehler) {
            throw new Ungueltig("source.properties ist nicht lesbar.");
        }
        String kennung = eigenschaften.getProperty("Pkg.Path");
        if (kennung != null && !kennung.equals(paket)) {
            throw new Ungueltig("source.properties beschreibt '" + kennung + "'.");
        }
        String revision = eigenschaften.getProperty("Pkg.Revision");
        if (revision == null || revision.isEmpty()) {
            return null;
        }
        return revision;
    }

    // Revisionen aus Zahlen und Punkten werden Stelle fuer Stelle verglichen,
    // fehlende Stellen gelten als 0. Revisionen mit Zusatz wie "36.0.0 rc5"
    // werden als Text verglichen.
    static boolean gleich(String a, String b) {
        String zahlen = "[0-9]+(\\.[0-9]+)*";
        if (!a.matches(zahlen) || !b.matches(zahlen)) {
            return a.equals(b);
        }
        String[] x = a.split("\\.");
        String[] y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            BigInteger p = i < x.length ? new BigInteger(x[i]) : BigInteger.ZERO;
            BigInteger q = i < y.length ? new BigInteger(y[i]) : BigInteger.ZERO;
            if (!p.equals(q)) {
                return false;
            }
        }
        return true;
    }

    static String ascii(String text) {
        StringBuilder ergebnis = new StringBuilder();
        for (int i = 0; i < text.length(); i++) {
            char zeichen = text.charAt(i);
            if (zeichen >= 0x20 && zeichen < 0x7f && zeichen != '\\') {
                ergebnis.append(zeichen);
            } else {
                ergebnis.append(String.format("\\u%04X", (int) zeichen));
            }
        }
        return ergebnis.toString();
    }
}
