export const builtinSnippets = [
  { name: "SELECT * FROM", sql: "SELECT * FROM " },
  { name: "CREATE TABLE", sql: "CREATE TABLE name (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n);\n" },
  { name: "INSERT INTO", sql: "INSERT INTO name (id, name) VALUES (1, 'alpha');\n" },
  { name: "SELECT :id", sql: "SELECT :id AS id;\n" }
] as const
