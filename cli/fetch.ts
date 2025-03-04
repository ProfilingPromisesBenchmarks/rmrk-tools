#! /usr/bin/env node
import {
  filterBlocksByCollection,
  getApi,
  getLatestBlock,
  getLatestFinalizedBlock,
  prefixToArray,
} from "../src/tools/utils";
import fs from "fs";
import fetchRemarks from "../src/tools/fetchRemarks";
import arg from "arg";

const fetch = async () => {
  const args = arg({
    // Types
    "--ws": String, // Optional websocket url
    "--append": String, // Path to append new remarks to, will auto-detect last block and use it as FROM. Overrides FROM. If file does not exist, it will be created and FROM will default to 0.
    "--from": Number, // The starting block
    "--to": Number, // The starting block
    "--prefixes": String, // Limit remarks to prefix. No default. Can be hex (0x726d726b,0x524d524b) or string (rmrk,RMRK), or combination (rmrk,0x524d524b), separate with comma for multiple
    "--output": String, // Filename to save data into, defaults to `remarks-${from}-${to}-${args["--prefixes"] || ""}.json`
    "--fin": String, // "yes" by default. If omitting `from`, will default to last finalized. If this is "no", will default to last block.
    "--collection": String, // Filter by specific collection
    "--ss58Format": Number,
  });

  console.log(args);
  const ws = args["--ws"] || "ws://127.0.0.1:9944";
  const api = await getApi(ws);
  const append = args["--append"];
  console.log("Connecting to " + ws);
  let from = args["--from"] || 0;
  const output = args["--output"] || "";
  const fin = args["--fin"] || "yes";
  const collectionFilter = args["--collection"];

  const systemProperties = await api.rpc.system.properties();
  const { ss58Format: chainSs58Format } = systemProperties.toHuman();

  const ss58Format = args["--ss58Format"] || (chainSs58Format as number) || 2;

  // Grab FROM from append file
  let appendFile = [];
  if (append) {
    console.log("Will append to " + append);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.appendFileSync(append, "");
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const fileContent = fs.readFileSync(append).toString();
      if (fileContent) {
        appendFile = JSON.parse(fileContent);
        if (appendFile.length) {
          const lastBlock = appendFile.pop();
          from = lastBlock.block + 1;
        }
      }
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  }

  const latestProgrammatic =
    fin === "yes"
      ? await getLatestFinalizedBlock(api)
      : await getLatestBlock(api);

  const to =
    typeof args["--to"] === "number" ? args["--to"] : latestProgrammatic;

  if (from > to) {
    console.error("Starting block must be less than ending block.");
    process.exit(1);
  }

  console.log(`Processing block range from ${from} to ${to}.`);
  let extracted = await fetchRemarks(
    api,
    from,
    to,
    prefixToArray(args["--prefixes"] || ""),
    ss58Format
  );

  if (collectionFilter) {
    extracted = filterBlocksByCollection(
      extracted,
      collectionFilter,
      prefixToArray(args["--prefixes"] || "")
    );
  }

  let outputFileName =
    output !== ""
      ? output
      : `remarks-${from}-${to}-${args["--prefixes"] || ""}.json`;
  console.log(`Will write to file ${outputFileName}`);
  if (append) {
    extracted = appendFile.concat(extracted);
    console.log(`Appending ${appendFile.length} remarks found. Full set:`);
    outputFileName = append;
  }
  extracted.push({
    block: to,
    calls: [],
  });
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(outputFileName, JSON.stringify(extracted));
  process.exit(0);
};

fetch();
