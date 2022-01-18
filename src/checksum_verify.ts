import * as core from "@actions/core";
import * as crypto from "crypto"
import * as fs from "fs"

export function checksumVerify(downloadPath: string){


    const fileBuffer:Buffer = fs.readFileSync(downloadPath)
    const checksum: string = crypto.createHash("sha256").update(fileBuffer).digest('hex'); // checksum of downloaded file

    const expectedChecksum: string = core.getInput("expected_checksum") // default checksum
    
    if(checksum !== expectedChecksum){
        core.error(`Checksum verification failed.`)
        core.setFailed(`Checksum expected ${expectedChecksum} instead got ${checksum}`)
    }

    core.debug("Checksum verification passed.")

}