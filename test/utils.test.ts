import { ReadableStream, WritableStream } from "node:stream/web"
import { iter, joinStreams } from "../src/utils"

describe("iter test", () => {

    it("iter is iterable with step", () => {
        const arr: number[] = []
        for (const i of iter(0, 10)) arr.push(i)
        expect(arr).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it("iter is spreadable", () => {
        const arr = [...iter(0, 10)]
        expect(arr).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it("iter is iterable with step", () => {
        const arr: number[] = []
        for (const i of iter(4, 3, 2)) arr.push(i)
        expect(arr).toStrictEqual([4, 6, 8])
    })

    it("joinStreams joins Stream", async () => {
        const rs1 = new ReadableStream<string>({
            pull(controller) {
                controller.enqueue("a")
                controller.enqueue("b")
                controller.enqueue("c")
                controller.close()
            },
        })
        const rs2 = new ReadableStream<string>({
            pull(controller) {
                controller.enqueue("A")
                controller.enqueue("B")
                controller.enqueue("C")
                controller.close()
            },
        })
        const arr: string[] = []
        const ws = new WritableStream<string>({
            write(str) {
                arr.push(str)
            }
        })
        await joinStreams(rs1, rs2, (v1, v2) => `${v1}-${v2}`).pipeTo(ws)
        expect(arr).toStrictEqual(["a-A", "b-B", "c-C"])
    })


})