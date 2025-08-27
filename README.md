<!--

author: André Dietrich
email:  LiaScript@web.de

comment: This script provides functions to interact with SQLite databases in the browser.

logo:    https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/SQLite370.svg/640px-SQLite370.svg.png

script: dist/index.js

@onload
window.dbs = window.dbs || {};

window.fetchDB = async function(url, name, send) {
  try {
    const result = await fetch(url)
    const data  = await result.arrayBuffer();
    window.dbs[name] = new SQL.Database(new Uint8Array(data));

    if (send) {
      send.lia(`loaded database ${name} from ${url}`)
    }
  } catch (error) {
    if (send) {
      send.lia(`Error fetching database ${name} from ${url}: ${error}`);
    }
  }
}

window.exportDB = async function(db, name) {
  const data = db.export();
  window.console.log("Database exported, size =", data.length, "bytes");
  const blob = new Blob([data], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name || 'database'}.sqlite`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  return url;
}

window.importDB = function(name) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sqlite,.db,application/x-sqlite3';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async (event) => {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) {
        reject("No file selected");
        return;
      }
      try {
        const arrayBuffer = await file.arrayBuffer();
        const uInt8Array = new Uint8Array(arrayBuffer);
        const db = new SQL.Database(uInt8Array);
        db.name = name;
        window.dbs[name] = db;
        resolve("ok");
      } catch (err) {
        reject("Error importing database: " + err.message);
      }
    });
    input.click();
  });
}

window.normalizeData = function(data) {
  // data is an array of { columns, values }
  return data.flatMap(({ columns, values }) =>
    values.map((row) =>
      Object.fromEntries(row.map((cell, i) => [columns[i], cell]))
    )
  );
}

window.toTable = function(data) {
  const normalized = window.normalizeData(data);
  return window.consoleTableHTML(normalized);
}

window.runSQL = async function(db, sql, params = []) {
  const firstWord = (sql.match(/^\s*([a-z]+)/i)?.[1] || "").toUpperCase();
  const isSelect = firstWord === "SELECT" || firstWord === "WITH";
  const isChange = /^(INSERT|UPDATE|DELETE|REPLACE)$/i.test(firstWord);
  const isCustom = /^(EXPORT|IMPORT)$/i.test(firstWord);

  if (isSelect) {
    const queryResults = db.exec(sql, params);
    const rows = window.normalizeData(queryResults);
    return {
      type: "select",
      command: firstWord,
      rows,
      rowCount: rows.length
    };
  } else if (isChange) {
    db.run(sql, params);
    const rowsModified = db.getRowsModified();
    const li = db.exec("SELECT last_insert_rowid() AS id");
    const lastInsertRowid = li?.[0]?.values?.[0]?.[0] ?? null;
    return {
      type: "change",
      command: firstWord,
      rowsModified,
      lastInsertRowid
    };
  } else if (isCustom) {
    console.log("Custom command detected:", sql);
    if (firstWord == "EXPORT") {
      try {
        const msg = await window.exportDB(db, db.name);
        console.log(msg);
      } catch (err) {
        console.error(err);
      }
    } else if (firstWord == "IMPORT") {
      const url = sql.replace(/\s+/g, ' ').split(" ")[1]

      if (url) {
        await window.fetchDB(url, db.name);
      } else {
        await window.importDB(db.name);
      }
    }
  } else {
    // DDL / transaction / pragma etc.
    db.run(sql, params);
    return {
      type: "command",
      command: firstWord || "UNKNOWN",
      success: true
    };
  }
};

window.stripSQLComments = function(sql) {
  return sql
    // remove /* ... */ block comments
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // remove -- ... end of line comments
    .replace(/--.*/g, "")
    .trim();
}

// Render any runSQL() result to HTML
window.formatSQLResultHTML = function(result) {
  if (!result) return "";
  if (result.type === "select") {
    // Build html table from rows
    return window.consoleTableHTML(result.rows);
  }
  // change/command → status line
  if (result.type === "change") {
    const n = result.rowsModified ?? 0;
    const msg = `Query OK, ${n} row${n === 1 ? "" : "s"} affected` +
      (result.lastInsertRowid != null ? ` (last id = ${result.lastInsertRowid})` : "");
    return msg;
  }
  if (result.type === "command") {
    return result.command + " OK";
  }
  return "OK";
};
@end

@SQL.run: <script>
    if (!window.dbs["@0"]) {
        window.dbs["@0"] = new SQL.Database();
    }

    window.dbs["@0"].name = "@0";

    async function run(sql_queries, printCommand=true) {
        try {
            sql_queries = window.stripSQLComments(sql_queries || "");

            if (sql_queries && /\S/.test(sql_queries)) {
                sql_queries = sql_queries.split(";").map(s => s.trim()).filter(Boolean);

                for (let i=0; i< sql_queries.length; i++) {
                    const sql = sql_queries[i];

                    try {
                        const r = await window.runSQL(window.dbs["@0"], sql);
                        if (printCommand) console.debug(sql);

                        console.html(window.formatSQLResultHTML(r) || "<pre>OK</pre>");
                    } catch (err) {
                        console.error(String(err && err.message || err));
                    }

                    console.log();
                }
            }
        } catch(e) {
            console.error("\nerror =>", e);
        }
    }

    send.handle("input", (input) => {
        run(input, false);
    });

    run(`@input`);

    "LIA: terminal";
  </script>

@SQL.run2: <script>
    if (!window.dbs["@0"]) {
        window.dbs["@0"] = new SQL.Database();
    }
    window.dbs["@0"].name = "@0";

    function run(sql_queries, printCommand=true, hideOutput=false) {
        try {
            sql_queries = window.stripSQLComments(sql_queries || "");

            if (sql_queries && /\S/.test(sql_queries)) {
                sql_queries = sql_queries.split(";").map(s => s.trim()).filter(Boolean);

                for (let i=0; i< sql_queries.length; i++) {
                    const sql = sql_queries[i];

                    try {
                        const r = window.runSQL(window.dbs["@0"], sql);
                        if (printCommand && !hideOutput) console.debug(sql);

                        if (!hideOutput) {
                          console.html(window.formatSQLResultHTML(r) || "<pre>OK</pre>");
                          console.log();
                        }
                    } catch (err) {
                        console.error(String(err && err.message || err));
                    }
                }
            }
        } catch(e) {
            console.error("\nerror =>", e);
        }
    }

    send.handle("input", (input) => {
        run(input, false);
    });

    run(`@input(0)`, true, true);
    run(`@input(1)`, true, false);

    "LIA: terminal";
  </script>

SQL.load: <script run-once>
    function loadDB() {
      if (window.SQL) {
        window.fetchDB("@1", "@0", send);
      } else {
        setTimeout(() => {
          loadDB();
        }, 100);
      }
    }

    loadDB();
    "LIA: wait"
  </script>

-->

# SQL.js - SQLite in the Browser

    --{{0}}--
This template enables you to use SQLite databases directly in LiaScript via sql.js. You can create, query, import, and export databases interactively in your Markdown documents.

__Try it on LiaScript:__

https://liascript.github.io/course/?https://raw.githubusercontent.com/liaTemplates/SQLite/main/README.md

__See the project on Github:__

https://github.com/liaTemplates/SQLite

                         --{{1}}--
Like with other LiaScript templates, there are three ways to integrate SQL.js:

                           {{1}}
1. Load the latest macros via (this might cause breaking changes)

   `import: https://raw.githubusercontent.com/liaTemplates/SQLite/main/README.md`

   or the current version 0.0.1 via:

   `import: https://raw.githubusercontent.com/LiaTemplates/SQLite/0.0.1/README.md`

2. Copy the definitions into your Project

3. Clone this repository on GitHub


## `@SQL.run`

    --{{0}}--
Executes SQL code blocks against the default in-memory database. Each statement is run in sequence, and the results are rendered as HTML tables or status messages. You have to call the macro with a database name, this way different databases can be referenced in the course.

**Example:**

```` markdown
```SQL
CREATE TABLE hello (a int, b char);
INSERT INTO hello VALUES (0, 'hello');
INSERT INTO hello VALUES (1, 'world');
SELECT * FROM hello;
```
@SQL.run(hello-db)

```SQL
INSERT INTO hello VALUES (2, 'more');
INSERT INTO hello VALUES (3, 'updates');
```
@SQL.run(hello-db)
````

------------------

__Result:__

```SQL
CREATE TABLE hello (a int, b char);
INSERT INTO hello VALUES (0, 'hello');
INSERT INTO hello VALUES (1, 'world');
SELECT * FROM hello;
```
@SQL.run(hello-db)

```SQL
INSERT INTO hello VALUES (2, 'more');
INSERT INTO hello VALUES (3, 'updates');
```
@SQL.run(hello-db)

## `@SQL.run2`

    --{{0}}--
If you want to focus on one aspect of the SQL queries and want to hide a part, you can use `@SQL.run2`, which is similar to `@SQL.run`, but it allows to run two code blocks in a row. While you can define with the plus and minus signs, which to show and which to hide.

**Example:**

```` markdown
```SQL  -populate
-- Create sales table
DROP TABLE IF EXISTS sales;
CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  salesperson TEXT NOT NULL,
  region TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  sale_date DATE NOT NULL
);

-- Insert sample data
INSERT INTO sales (salesperson, region, amount, sale_date) VALUES
  ('Alice', 'North', 12500, '2023-01-05'),
  ('Bob', 'South', 8700, '2023-01-10'),
  ('Carol', 'East', 15200, '2023-01-12'),
  ('Dave', 'West', 7300, '2023-01-15'),
  ('Alice', 'North', 9800, '2023-02-03'),
  ('Bob', 'South', 11600, '2023-02-08'),
  ('Carol', 'East', 14100, '2023-02-15'),
  ('Dave', 'West', 9200, '2023-02-20'),
  ('Alice', 'North', 16700, '2023-03-05'),
  ('Bob', 'South', 10300, '2023-03-12'),
  ('Carol', 'East', 12800, '2023-03-18'),
  ('Dave', 'West', 8500, '2023-03-25');
```
```SQL  +query
-- 1. Running total of sales by salesperson
SELECT
  salesperson,
  region,
  sale_date,
  amount,
  SUM(amount) OVER (
    PARTITION BY salesperson 
    ORDER BY sale_date
  ) AS running_total
FROM sales
ORDER BY salesperson, sale_date;
```
@SQL.run2(sales)
````

----

__Result:__

```SQL  -populate
-- Create sales table
DROP TABLE IF EXISTS sales;
CREATE TABLE sales (
  id INTEGER PRIMARY KEY,
  salesperson TEXT NOT NULL,
  region TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  sale_date DATE NOT NULL
);

-- Insert sample data
INSERT INTO sales (salesperson, region, amount, sale_date) VALUES
  ('Alice', 'North', 12500, '2023-01-05'),
  ('Bob', 'South', 8700, '2023-01-10'),
  ('Carol', 'East', 15200, '2023-01-12'),
  ('Dave', 'West', 7300, '2023-01-15'),
  ('Alice', 'North', 9800, '2023-02-03'),
  ('Bob', 'South', 11600, '2023-02-08'),
  ('Carol', 'East', 14100, '2023-02-15'),
  ('Dave', 'West', 9200, '2023-02-20'),
  ('Alice', 'North', 16700, '2023-03-05'),
  ('Bob', 'South', 10300, '2023-03-12'),
  ('Carol', 'East', 12800, '2023-03-18'),
  ('Dave', 'West', 8500, '2023-03-25');
```
```SQL  +query
-- 1. Running total of sales by salesperson
SELECT
  salesperson,
  region,
  sale_date,
  amount,
  SUM(amount) OVER (
    PARTITION BY salesperson 
    ORDER BY sale_date
  ) AS running_total
FROM sales
ORDER BY salesperson, sale_date;
```
@SQL.run2(sales)

## `@SQL.load`

    --{{0}}--
You can use this macro to fetch an exported SQLite database file from a given URL and loads it as a database instance. The link macro notation can be used therefor in order to translate relative paths correctly.

**Usage:**

```` markdown
@[SQL.load(employees)](./sql.db)

```SQL
-- Query the data
SELECT 
  department, 
  COUNT(*) as employee_count,
  ROUND(AVG(salary), 2) as avg_salary
FROM employees
GROUP BY department
ORDER BY avg_salary DESC;
```
@SQL.run(employees)
````

@[SQL.load(employees)](./employees.db)

```SQL
-- Query the data
SELECT 
  department, 
  COUNT(*) as employee_count,
  ROUND(AVG(salary), 2) as avg_salary
FROM employees
GROUP BY department
ORDER BY avg_salary DESC;
```
@SQL.run(employees)

## Custom Commands

### `EXPORT`

    --{{0}}--
In order to export the current database to a file, you can use the following command:

```` markdown
``` SQL
-- Create a simple employees table
DROP TABLE IF EXISTS employees;
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  salary NUMERIC,
  hire_date DATE
);

-- Insert sample data
INSERT INTO employees (name, department, salary, hire_date) VALUES
  ('Alice Smith', 'Engineering', 85000, '2020-01-15'),
  ('Bob Johnson', 'Marketing', 72000, '2019-03-20'),
  ('Carol Williams', 'Engineering', 92000, '2018-11-07'),
  ('Dave Brown', 'Finance', 115000, '2017-05-12'),
  ('Eve Davis', 'Engineering', 110000, '2021-08-30');

EXPORT;
```
@SQL.run(employees2)
````

----------

``` SQL
-- Create a simple employees table
DROP TABLE IF EXISTS employees;
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  salary NUMERIC,
  hire_date DATE
);

-- Insert sample data
INSERT INTO employees (name, department, salary, hire_date) VALUES
  ('Alice Smith', 'Engineering', 85000, '2020-01-15'),
  ('Bob Johnson', 'Marketing', 72000, '2019-03-20'),
  ('Carol Williams', 'Engineering', 92000, '2018-11-07'),
  ('Dave Brown', 'Finance', 115000, '2017-05-12'),
  ('Eve Davis', 'Engineering', 110000, '2021-08-30');

EXPORT;
```
@SQL.run(employees2)


### `IMPORT`

    --{{0}}--
In order to import a previously exported database file, you can use the following command. This will open a file picker dialog to select the database file.

__Example:__

```` markdown
``` SQL
IMPORT;

SELECT name, sql
FROM sqlite_master
WHERE type='table';
```
@SQL.run(import)
````

-----------------

__Result:__

``` SQL
IMPORT;

SELECT name, sql
FROM sqlite_master
WHERE type='table';
```
@SQL.run(import)

      {{1}}
<section>

    --{{1}}--
Additionally you can import an existing database from a http(s) URL:

```` markdown
``` SQL
IMPORT https://example.com/path/to/your/database.db;

SELECT name, sql
FROM sqlite_master
WHERE type='table';
```
@SQL.run(import)
````

</section>

