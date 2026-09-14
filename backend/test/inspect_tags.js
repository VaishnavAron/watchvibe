import { driver } from "../src/core/2_config.js";

async function inspect() {
  const session = driver.session();
  const res = await session.run(`
    MATCH (m:Movie {title: "Friday Night Plan"})
    OPTIONAL MATCH (m)-[:BELONGS_TO]->(g:Genre)
    OPTIONAL MATCH (m)-[:EXPLORES]->(t:Theme)
    RETURN m.title, collect(g.name) as genres, collect(t.name) as themes
  `);
  console.log("Friday Night Plan:", res.records.map(r => r.toObject()));
  await session.close();
  await driver.close();
}
inspect();
