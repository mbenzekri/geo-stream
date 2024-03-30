import { GeojsonParser,NodeS2WebS, FeatureLocation} from "../src/geo-stream"
import { WritableStream } from "node:stream/web"
import * as fs from "fs"

const o_jsonbuf = fs.readFileSync("./test/poi_3.geojson").subarray()
const o_features =  JSON.parse(o_jsonbuf.toString('utf-8')).features
const o_geojson = {  "name": "poi", "type": "FeatureCollection", "features": [
    { "type": "Feature", "properties": { "name": "A" }, "geometry": { "type": "Point", "coordinates": [ 1.0, 1.0] }},
    { "type": "Feature", "properties": { "name": "B" }, "geometry": { "type": "Point", "coordinates": [ 2.0, 2.0] }},
    { "type": "Feature", "properties": { "name": "C" }, "geometry": { "type": "Point", "coordinates": [ 3.0, 3.0] }}
]}

describe("Geojson test", () => {

  it("GeojsonParser is instantiable", () => {
    expect(new GeojsonParser()).toBeInstanceOf(GeojsonParser)
  })

  it("Can parse Uint8Array buffer", () => {
    const parser = new GeojsonParser()
    let features:any[] = []
    const buffer = Buffer.from(JSON.stringify(o_geojson))
    parser.parse(buffer, floc => features.push(floc.json))
    expect(features).toStrictEqual(o_geojson.features)
  })

  it("Can parse a byte Stream ", async () => {
    const rs = new Blob([Buffer.from(JSON.stringify(o_geojson))]).stream()
    const parser = new GeojsonParser()
    let features:any[] = []
    const ws = new WritableStream({ write :(floc: FeatureLocation) => { features.push(floc.json) } })
    await rs.pipeThrough(parser).pipeTo(ws)
    expect(features).toStrictEqual(o_geojson.features)
  })

  it("Can parse a byte Stream (from node stream)", async () => {
    const rs = NodeS2WebS(fs.createReadStream("./test/poi_3.geojson"))
    const parser = new GeojsonParser()
    let features:any[] = []
    const ws = new WritableStream({ write :(floc) => { features.push(floc.json) } })
    await rs.pipeThrough(parser).pipeTo(ws)
    expect(features).toStrictEqual(o_features)
  })


})
