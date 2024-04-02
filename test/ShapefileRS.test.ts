import { ShpRS,DbfRS } from "../src/ShapefileRS"
import { Feature } from "../src/types"
import { NodeS2WebS, ArrayWS, toByteRS, copyFeature, joinStreams } from "../src/utils"
import * as fs from "fs"

const o_shpbuf = fs.readFileSync("./test/data/point_3.shp")
const o_dbfbuf = fs.readFileSync("./test/data/point_3.dbf")
const o_geojson = JSON.parse(fs.readFileSync("./test/data/point_3.geojson", "utf-8"))

describe("ShapefileRS test", () => {

    it("can join ShpRS+DbfRS", async () => {
        const shprs=(new toByteRS(o_shpbuf)).pipeThrough( new ShpRS())
        const dbfrs=(new toByteRS(o_dbfbuf)).pipeThrough( new DbfRS())
        const ws = new ArrayWS<Feature>()
        await joinStreams(shprs,dbfrs,(f,p) => { 
            f.properties = p; 
            return f
        }).pipeTo(ws)
        expect(ws.store).toStrictEqual(o_geojson.features)
    })

    it("can iterate a join ShpRS+DbfRS", async () => {
        const features:Feature[]=[]
        const shprs=(new toByteRS(o_shpbuf)).pipeThrough( new ShpRS())
        const dbfrs=(new toByteRS(o_dbfbuf)).pipeThrough( new DbfRS())
        const join =joinStreams(shprs,dbfrs,(f,p) => {  f.properties = p;  return f })
        for await (const feature of join)  features.push(feature)
        expect(features).toStrictEqual(o_geojson.features)
    })

})
