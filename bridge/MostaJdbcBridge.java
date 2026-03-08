/**
 * MostaJdbcBridge — Universal HTTP-to-JDBC bridge for @mostajs/orm
 *
 * Accepts POST /query with JSON { "sql": "...", "params": [...] }
 * Executes via JDBC and returns JSON results.
 *
 * Works with any JDBC driver: HSQLDB, Oracle, DB2, Sybase, etc.
 *
 * Usage:
 *   java -cp "MostaJdbcBridge.java:hsqldb-2.7.2.jar" MostaJdbcBridge \
 *        --jdbc-url jdbc:hsqldb:hsql://localhost:9001/xdb \
 *        --user SA --password "" --port 8765
 *
 * Compile-free (Java 11+ source launcher):
 *   java --source 11 -cp hsqldb-2.7.2.jar MostaJdbcBridge.java \
 *        --jdbc-url jdbc:hsqldb:hsql://localhost:9001/xdb
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */

import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;
import java.util.concurrent.Executors;

public class MostaJdbcBridge {

    private static String jdbcUrl;
    private static String dbUser = "SA";
    private static String dbPassword = "";
    private static int httpPort = 8765;
    private static Connection connection;

    public static void main(String[] args) throws Exception {
        parseArgs(args);

        System.out.println("[MostaJdbcBridge] Connecting to: " + jdbcUrl);
        connection = DriverManager.getConnection(jdbcUrl, dbUser, dbPassword);
        System.out.println("[MostaJdbcBridge] JDBC connected OK");

        HttpServer server = HttpServer.create(new InetSocketAddress(httpPort), 0);
        server.setExecutor(Executors.newFixedThreadPool(4));

        server.createContext("/query", MostaJdbcBridge::handleQuery);
        server.createContext("/health", MostaJdbcBridge::handleHealth);

        server.start();
        System.out.println("[MostaJdbcBridge] HTTP bridge listening on port " + httpPort);
        System.out.println("[MostaJdbcBridge] POST /query  — execute SQL");
        System.out.println("[MostaJdbcBridge] GET  /health — health check");
    }

    // ── /query handler ──────────────────────────────────────────

    private static void handleQuery(HttpExchange ex) throws IOException {
        // CORS headers
        ex.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        ex.getResponseHeaders().add("Access-Control-Allow-Methods", "POST, OPTIONS");
        ex.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type");

        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(204, -1);
            return;
        }

        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            sendJson(ex, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        try {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> request = parseJson(body);

            String sql = (String) request.get("sql");
            List<?> params = (List<?>) request.getOrDefault("params", Collections.emptyList());

            if (sql == null || sql.isBlank()) {
                sendJson(ex, 400, "{\"error\":\"Missing 'sql' field\"}");
                return;
            }

            // Reconnect if connection was lost
            if (connection == null || connection.isClosed()) {
                connection = DriverManager.getConnection(jdbcUrl, dbUser, dbPassword);
            }

            String sqlUpper = sql.trim().toUpperCase();
            boolean isQuery = sqlUpper.startsWith("SELECT")
                           || sqlUpper.startsWith("SHOW")
                           || sqlUpper.startsWith("DESCRIBE")
                           || sqlUpper.startsWith("EXPLAIN");

            if (isQuery) {
                handleSelect(ex, sql, params);
            } else {
                handleUpdate(ex, sql, params);
            }

        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getName();
            sendJson(ex, 500, "{\"error\":" + jsonString(msg) + "}");
        }
    }

    // ── SELECT → JSON array of objects ──────────────────────────

    private static void handleSelect(HttpExchange ex, String sql, List<?> params) throws Exception {
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            bindParams(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                ResultSetMetaData meta = rs.getMetaData();
                int colCount = meta.getColumnCount();

                StringBuilder sb = new StringBuilder("[");
                boolean first = true;
                while (rs.next()) {
                    if (!first) sb.append(",");
                    first = false;
                    sb.append("{");
                    for (int i = 1; i <= colCount; i++) {
                        if (i > 1) sb.append(",");
                        String colName = meta.getColumnLabel(i);
                        Object value = rs.getObject(i);
                        sb.append(jsonString(colName)).append(":");
                        sb.append(jsonValue(value));
                    }
                    sb.append("}");
                }
                sb.append("]");
                sendJson(ex, 200, sb.toString());
            }
        }
    }

    // ── INSERT/UPDATE/DELETE → { changes: N } ───────────────────

    private static void handleUpdate(HttpExchange ex, String sql, List<?> params) throws Exception {
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            bindParams(ps, params);
            int changes = ps.executeUpdate();
            sendJson(ex, 200, "{\"changes\":" + changes + "}");
        }
    }

    // ── /health handler ─────────────────────────────────────────

    private static void handleHealth(HttpExchange ex) throws IOException {
        ex.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        boolean ok = false;
        try {
            ok = connection != null && !connection.isClosed() && connection.isValid(2);
        } catch (SQLException ignored) {}
        String json = "{\"status\":" + (ok ? "\"ok\"" : "\"error\"") + ",\"jdbcUrl\":" + jsonString(jdbcUrl) + "}";
        sendJson(ex, ok ? 200 : 503, json);
    }

    // ── Helpers ─────────────────────────────────────────────────

    private static void bindParams(PreparedStatement ps, List<?> params) throws SQLException {
        if (params == null) return;
        for (int i = 0; i < params.size(); i++) {
            Object v = params.get(i);
            if (v == null)                    ps.setNull(i + 1, Types.NULL);
            else if (v instanceof String)     ps.setString(i + 1, (String) v);
            else if (v instanceof Integer)    ps.setInt(i + 1, (Integer) v);
            else if (v instanceof Long)       ps.setLong(i + 1, (Long) v);
            else if (v instanceof Double)     ps.setDouble(i + 1, (Double) v);
            else if (v instanceof Float)      ps.setFloat(i + 1, (Float) v);
            else if (v instanceof Boolean)    ps.setBoolean(i + 1, (Boolean) v);
            else                              ps.setString(i + 1, v.toString());
        }
    }

    private static void sendJson(HttpExchange ex, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static String jsonString(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\", "\\\\")
                       .replace("\"", "\\\"")
                       .replace("\n", "\\n")
                       .replace("\r", "\\r")
                       .replace("\t", "\\t") + "\"";
    }

    private static String jsonValue(Object v) {
        if (v == null)                   return "null";
        if (v instanceof Number)         return v.toString();
        if (v instanceof Boolean)        return v.toString();
        return jsonString(v.toString());
    }

    /** Minimal JSON parser for { "sql": "...", "params": [...] } */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> parseJson(String json) {
        json = json.trim();
        Map<String, Object> map = new HashMap<>();
        if (!json.startsWith("{")) return map;

        // Remove outer braces
        json = json.substring(1, json.lastIndexOf('}'));

        // Find "sql" value
        int sqlKeyIdx = json.indexOf("\"sql\"");
        if (sqlKeyIdx >= 0) {
            int colonIdx = json.indexOf(':', sqlKeyIdx + 4);
            String sqlVal = extractStringValue(json, colonIdx + 1);
            map.put("sql", sqlVal);
        }

        // Find "params" array
        int paramsKeyIdx = json.indexOf("\"params\"");
        if (paramsKeyIdx >= 0) {
            int bracketStart = json.indexOf('[', paramsKeyIdx);
            int bracketEnd = findMatchingBracket(json, bracketStart);
            if (bracketStart >= 0 && bracketEnd >= 0) {
                String arrStr = json.substring(bracketStart + 1, bracketEnd).trim();
                List<Object> params = parseArray(arrStr);
                map.put("params", params);
            }
        }

        return map;
    }

    private static String extractStringValue(String json, int fromIdx) {
        int firstQuote = json.indexOf('"', fromIdx);
        if (firstQuote < 0) return "";
        StringBuilder sb = new StringBuilder();
        boolean escaped = false;
        for (int i = firstQuote + 1; i < json.length(); i++) {
            char c = json.charAt(i);
            if (escaped) {
                switch (c) {
                    case 'n': sb.append('\n'); break;
                    case 'r': sb.append('\r'); break;
                    case 't': sb.append('\t'); break;
                    default:  sb.append(c);    break;
                }
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                break;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private static int findMatchingBracket(String s, int openIdx) {
        if (openIdx < 0) return -1;
        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int i = openIdx; i < s.length(); i++) {
            char c = s.charAt(i);
            if (escaped) { escaped = false; continue; }
            if (c == '\\') { escaped = true; continue; }
            if (c == '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c == '[') depth++;
            if (c == ']') { depth--; if (depth == 0) return i; }
        }
        return -1;
    }

    private static List<Object> parseArray(String arrContent) {
        List<Object> list = new ArrayList<>();
        if (arrContent.isEmpty()) return list;

        int i = 0;
        while (i < arrContent.length()) {
            char c = arrContent.charAt(i);
            if (c == ' ' || c == ',' || c == '\n' || c == '\r' || c == '\t') { i++; continue; }

            if (c == '"') {
                String val = extractStringValue(arrContent, i - 1);
                list.add(val);
                // Skip past the closing quote
                i++; // skip opening quote
                boolean esc = false;
                while (i < arrContent.length()) {
                    char ch = arrContent.charAt(i);
                    if (esc) { esc = false; i++; continue; }
                    if (ch == '\\') { esc = true; i++; continue; }
                    if (ch == '"') { i++; break; }
                    i++;
                }
            } else if (c == 'n' && arrContent.startsWith("null", i)) {
                list.add(null);
                i += 4;
            } else if (c == 't' && arrContent.startsWith("true", i)) {
                list.add(Boolean.TRUE);
                i += 4;
            } else if (c == 'f' && arrContent.startsWith("false", i)) {
                list.add(Boolean.FALSE);
                i += 5;
            } else if (c == '-' || Character.isDigit(c)) {
                int start = i;
                boolean isDouble = false;
                while (i < arrContent.length() && (Character.isDigit(arrContent.charAt(i)) || arrContent.charAt(i) == '.' || arrContent.charAt(i) == '-' || arrContent.charAt(i) == 'e' || arrContent.charAt(i) == 'E')) {
                    if (arrContent.charAt(i) == '.' || arrContent.charAt(i) == 'e' || arrContent.charAt(i) == 'E') isDouble = true;
                    i++;
                }
                String numStr = arrContent.substring(start, i);
                if (isDouble) list.add(Double.parseDouble(numStr));
                else list.add(Long.parseLong(numStr));
            } else {
                i++;
            }
        }
        return list;
    }

    private static void parseArgs(String[] args) {
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--jdbc-url": case "-j": jdbcUrl    = args[++i]; break;
                case "--user":     case "-u": dbUser     = args[++i]; break;
                case "--password": case "-p": dbPassword = args[++i]; break;
                case "--port":                httpPort   = Integer.parseInt(args[++i]); break;
                default: break;
            }
        }
        if (jdbcUrl == null || jdbcUrl.isBlank()) {
            System.err.println("Usage: java MostaJdbcBridge --jdbc-url <JDBC_URL> [--user SA] [--password \"\"] [--port 8765]");
            System.err.println("Example: java --source 11 -cp hsqldb-2.7.2.jar MostaJdbcBridge.java --jdbc-url jdbc:hsqldb:hsql://localhost:9001/xdb");
            System.exit(1);
        }
    }
}
