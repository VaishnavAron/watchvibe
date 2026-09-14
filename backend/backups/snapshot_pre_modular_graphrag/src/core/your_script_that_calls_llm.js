import { llm } from "./2_config.js";

const response = await llm.invoke([{ role: "user", content: "Say hello" }]);
console.log("Content:", response.content);
console.log("All keys:", Object.keys(response));