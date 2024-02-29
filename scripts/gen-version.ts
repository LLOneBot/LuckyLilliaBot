import fs = require("fs");
import path = require("path");
import {version} from "../src/version";
const manifestPath = path.join(__dirname, "../manifest.json");
function readManifest(): any{
    if (fs.existsSync(manifestPath)){
        return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    }
}

function writeManifest(manifest: any){
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

let manifest = readManifest();
manifest.version = version;
manifest.name = `LLOneBot v${version}`;
writeManifest(manifest);