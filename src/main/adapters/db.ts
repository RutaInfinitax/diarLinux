/**
 * Base de datos del diario: SQLite cifrado con SQLCipher (better-sqlite3-multiple-ciphers).
 * La clave es la subllave "db" de la DEK (32 bytes crudos, sin KDF de SQLCipher: la
 * derivación lenta ya la hizo Argon2id). Una sola conexión, en el proceso main.
 */
import Database from 'better-sqlite3-multiple-ciphers'
import { toHex } from '../../core/crypto/bytes'

export type DB = Database.Database

// Migraciones versionadas (PRAGMA user_version). Nunca editar una ya publicada: agregar otra.
const MIGRACIONES: string[] = [
  // 1 — modelo inicial (sin ubicación ni seguimiento)
  `
  CREATE TABLE entries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,              -- AAAA-MM-DD
    time TEXT,                       -- HH:MM
    title TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL DEFAULT '',
    body_text TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL DEFAULT 0,
    weather_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX entries_date ON entries(date) WHERE deleted_at IS NULL;

  CREATE TABLE tags (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE UNIQUE INDEX tags_name ON tags(name COLLATE NOCASE) WHERE deleted_at IS NULL;

  CREATE TABLE people (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );

  CREATE TABLE entry_tags (entry_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY (entry_id, tag_id));
  CREATE INDEX entry_tags_tag ON entry_tags(tag_id);
  CREATE TABLE entry_people (entry_id TEXT NOT NULL, person_id TEXT NOT NULL, PRIMARY KEY (entry_id, person_id));
  CREATE INDEX entry_people_person ON entry_people(person_id);

  CREATE TABLE attachments (
    id TEXT PRIMARY KEY, entry_id TEXT NOT NULL,
    kind TEXT NOT NULL,              -- photo | video | audio | file
    mime TEXT NOT NULL, original_name TEXT NOT NULL, size INTEGER NOT NULL,
    width INTEGER, height INTEGER, duration REAL, sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );
  CREATE INDEX attachments_entry ON attachments(entry_id);

  CREATE TABLE templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, body_html TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  );

  CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);

  -- Búsqueda: "canción" encuentra "cancion". Contenido externo = la tabla entries (rowid).
  CREATE VIRTUAL TABLE entries_fts USING fts5(
    title, body_text, content='entries', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER entries_ai AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(rowid, title, body_text) VALUES (new.rowid, new.title, new.body_text);
  END;
  CREATE TRIGGER entries_ad AFTER DELETE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, title, body_text) VALUES ('delete', old.rowid, old.title, old.body_text);
  END;
  CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, title, body_text) VALUES ('delete', old.rowid, old.title, old.body_text);
    INSERT INTO entries_fts(rowid, title, body_text) VALUES (new.rowid, new.title, new.body_text);
  END;
  `,
  // 2 — personas con nombre único (como las etiquetas)
  `
  CREATE UNIQUE INDEX IF NOT EXISTS people_name ON people(name COLLATE NOCASE) WHERE deleted_at IS NULL;
  `,
  // 3 — qué se importó de otras apps (Joplin…): reanudar sin duplicar
  `
  CREATE TABLE importados (
    origen TEXT NOT NULL, id_externo TEXT NOT NULL, entry_id TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY (origen, id_externo)
  );
  `
]

export class ClaveDbIncorrecta extends Error {}

export function abrirDb(ruta: string, clave: Uint8Array): DB {
  const db = new Database(ruta)
  try {
    db.pragma(`cipher='sqlcipher'`)
    db.pragma(`legacy=4`)
    db.pragma(`key="x'${toHex(clave)}'"`)
    // Si la clave no corresponde, la primera lectura falla con "file is not a database"
    db.prepare('SELECT count(*) FROM sqlite_master').get()
  } catch (e) {
    db.close()
    if (String((e as Error).message).includes('not a database')) throw new ClaveDbIncorrecta()
    throw e
  }
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = FULL') // el autoguardado no pierde nada al cortarse la luz
  db.pragma('foreign_keys = ON')
  db.pragma('temp_store = MEMORY') // nada temporal al disco
  // NOCASE de SQLite solo pasa a minúsculas el ASCII ("LUCÍA" ≠ "Lucía"): comparar nombres con esto
  db.function('minus', { deterministic: true }, (x: unknown) =>
    typeof x === 'string' ? x.normalize('NFC').toLocaleLowerCase('es') : x
  )
  migrar(db)
  return db
}

function migrar(db: DB): void {
  const actual = db.pragma('user_version', { simple: true }) as number
  for (let v = actual; v < MIGRACIONES.length; v++) {
    db.transaction(() => {
      db.exec(MIGRACIONES[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}

/** Deja todo escrito en el archivo principal (para copiarlo en un backup). */
export function checkpoint(db: DB): void {
  db.pragma('wal_checkpoint(TRUNCATE)')
}
