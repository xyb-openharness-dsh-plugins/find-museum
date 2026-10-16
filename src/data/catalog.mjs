import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { distanceKm } from "../domain/route.mjs";
export class Catalog {
  constructor() {
    this.manifest = JSON.parse(
      readFileSync(
        new URL("../../data/processed/catalog-manifest.json", import.meta.url),
      ),
    );
    this.rows = JSON.parse(
      readFileSync(
        new URL("../../data/processed/catalog.json", import.meta.url),
      ),
    );
    this.seed = JSON.parse(
      readFileSync(
        new URL("../../data/processed/venues-suzhou.json", import.meta.url),
      ),
    );
    this.db = new DatabaseSync(":memory:");
    this.db.exec(
      "CREATE TABLE museum(id TEXT PRIMARY KEY,name TEXT,province TEXT,city TEXT,grade TEXT,county INTEGER,payload TEXT);CREATE INDEX museum_city ON museum(city);CREATE INDEX museum_province ON museum(province);CREATE INDEX museum_grade ON museum(grade);",
    );
    const insert = this.db.prepare("INSERT INTO museum VALUES(?,?,?,?,?,?,?)");
    this.db.exec("BEGIN");
    for (const r of this.rows)
      insert.run(
        r.museum_id,
        r.name,
        r.province,
        r.city || r.city_candidate,
        r.grade,
        r.county_level_candidate === "true" ? 1 : 0,
        JSON.stringify(r),
      );
    this.db.exec("COMMIT");
  }
  venues(overrides = []) {
    const m = new Map(this.seed.map((v) => [v.id, v]));
    for (const v of overrides) m.set(v.id, { ...(m.get(v.id) || {}), ...v });
    return [...m.values()];
  }
  search({
    q = "",
    city = "",
    province = "",
    grade = "",
    county = false,
    page = 1,
    pageSize = 40,
  } = {}) {
    const where = [],
      params = [];
    const like = (v) => "%" + v.replace(/[\\%_]/g, "\\$&") + "%";
    if (q) {
      where.push(
        "(name LIKE ? ESCAPE '\\' OR province LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\')",
      );
      params.push(like(q), like(q), like(q));
    }
    if (city) {
      where.push("city LIKE ? ESCAPE '\\'");
      params.push(like(city.replace(/市$/, "")));
    }
    if (province) {
      where.push("province=?");
      params.push(province);
    }
    if (grade) {
      where.push("grade=?");
      params.push(grade);
    }
    if (county) where.push("county=1");
    const sql = where.length ? " WHERE " + where.join(" AND ") : "";
    const total = this.db
      .prepare("SELECT count(*) AS n FROM museum" + sql)
      .get(...params).n;
    const rows = this.db
      .prepare(
        "SELECT payload FROM museum" + sql + " ORDER BY id LIMIT ? OFFSET ?",
      )
      .all(...params, pageSize, (page - 1) * pageSize)
      .map((x) => JSON.parse(x.payload));
    return { rows, total, page, pageSize, baseYear: this.manifest.baseYear };
  }
  detail(id) {
    const r = this.db.prepare("SELECT payload FROM museum WHERE id=?").get(id);
    return r ? JSON.parse(r.payload) : null;
  }
  close() {
    this.db.close();
  }
}
