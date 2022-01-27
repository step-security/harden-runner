import * as core from "@actions/core";
import * as crypto from "crypto"
import * as fs from "fs"

export function verifyChecksum(downloadPath: string){


    const fileBuffer:Buffer = fs.readFileSync(downloadPath)
    const checksum: string = crypto.createHash("sha256").update(fileBuffer).digest('hex'); // checksum of downloaded file

    const expectedChecksum: string = "a5f466fc5c8a9b809afd421e0f32903da98908feab5a245c734d3775e2e10032" // default checksum
    
    if(checksum !== expectedChecksum){
        core.setFailed(`Checksum verification failed, expected ${expectedChecksum} instead got ${checksum}`)
    }

    core.debug("Checksum verification passed.")

}