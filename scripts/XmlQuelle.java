// Liest eine XML-Quelldatei mit dem Parser des JDK und gibt den Baum als JSON aus.
// Aufruf: java scripts/XmlQuelle.java <Datei>
// Nur Elemente und Attribute; Text muss Leerraum sein. Keine DTD oder eigenen Entitaeten.
// Java-Quelle und JSON-Ausgabe enthalten nur ASCII, andere Zeichen werden maskiert.

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.xml.sax.ErrorHandler;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

public class XmlQuelle {
    public static void main(String[] args) {
        if (args.length != 1) {
            System.err.println("Aufruf: java XmlQuelle.java <Datei>");
            System.exit(1);
        }
        try {
            DocumentBuilderFactory fabrik = DocumentBuilderFactory.newInstance();
            fabrik.setNamespaceAware(true);
            fabrik.setXIncludeAware(false);
            fabrik.setExpandEntityReferences(false);
            fabrik.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            fabrik.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            fabrik.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            fabrik.setFeature("http://xml.org/sax/features/external-general-entities", false);
            fabrik.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            fabrik.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            fabrik.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            DocumentBuilder leser = fabrik.newDocumentBuilder();
            leser.setEntityResolver((publicId, systemId) -> {
                throw new SAXException();
            });
            leser.setErrorHandler(new ErrorHandler() {
                public void warning(SAXParseException fehler) throws SAXException { throw fehler; }
                public void error(SAXParseException fehler) throws SAXException { throw fehler; }
                public void fatalError(SAXParseException fehler) throws SAXException { throw fehler; }
            });
            StringBuilder ausgabe = new StringBuilder();
            try (InputStream strom = Files.newInputStream(Path.of(args[0]))) {
                baum(leser.parse(strom), ausgabe);
            }
            System.out.println(ausgabe);
        } catch (Exception fehler) {
            // Parsermeldungen koennen Teile der Datei enthalten: nicht ausgeben.
            System.err.println("XML-Datei ist ungueltig oder nicht lesbar.");
            System.exit(1);
        }
    }

    private static void baum(Node knoten, StringBuilder ausgabe) throws SAXException {
        ausgabe.append("{\"name\":");
        text(knoten.getNodeType() == Node.DOCUMENT_NODE ? "#" : knoten.getNodeName(), ausgabe);
        ausgabe.append(",\"attribute\":{");
        NamedNodeMap attribute = knoten.getAttributes();
        if (attribute != null) {
            for (int i = 0; i < attribute.getLength(); i++) {
                if (i > 0) ausgabe.append(',');
                Node attribut = attribute.item(i);
                text(attribut.getNodeName(), ausgabe);
                ausgabe.append(':');
                text(attribut.getNodeValue(), ausgabe);
            }
        }
        ausgabe.append("},\"kinder\":[");
        boolean erstes = true;
        for (Node kind = knoten.getFirstChild(); kind != null; kind = kind.getNextSibling()) {
            switch (kind.getNodeType()) {
                case Node.ELEMENT_NODE -> {
                    if (!erstes) ausgabe.append(',');
                    baum(kind, ausgabe);
                    erstes = false;
                }
                case Node.TEXT_NODE, Node.CDATA_SECTION_NODE -> {
                    if (!kind.getNodeValue().chars().allMatch(c -> c == ' ' || c == '\t' || c == '\n' || c == '\r')) {
                        throw new SAXException();
                    }
                }
                case Node.COMMENT_NODE, Node.PROCESSING_INSTRUCTION_NODE -> { }
                default -> throw new SAXException();
            }
        }
        ausgabe.append("]}");
    }

    private static void text(String wert, StringBuilder ausgabe) {
        ausgabe.append('"');
        for (int i = 0; i < wert.length(); i++) {
            char c = wert.charAt(i);
            if (c == '"' || c == '\\') {
                ausgabe.append('\\').append(c);
            } else if (c < 32 || c > 126) {
                String hex = Integer.toHexString(c);
                ausgabe.append("\\u").append("0".repeat(4 - hex.length())).append(hex);
            } else {
                ausgabe.append(c);
            }
        }
        ausgabe.append('"');
    }
}
