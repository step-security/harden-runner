require('./sourcemap-register.js');/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The require scope
/******/ 	var __nccwpck_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__nccwpck_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// ESM COMPAT FLAG
__nccwpck_require__.r(__webpack_exports__);

;// CONCATENATED MODULE: external "fs"
const external_fs_namespaceObject = require("fs");
;// CONCATENATED MODULE: ./src/cleanup.ts
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};

(() => __awaiter(void 0, void 0, void 0, function* () {
    if (process.platform !== "linux") {
        console.log("Only runs on linux");
        return;
    }
    external_fs_namespaceObject.writeFileSync("/home/agent/post_event.json", JSON.stringify({ event: "post" }));
    var doneFile = "/home/agent/done.json";
    var counter = 0;
    while (true) {
        if (!external_fs_namespaceObject.existsSync(doneFile)) {
            counter++;
            if (counter > 10) {
                console.log("timed out");
                break;
            }
            yield sleep(1000);
        } // The file *does* exist
        else {
            break;
        }
    }
    var log = "/home/agent/agent.log";
    console.log("log:");
    var content = external_fs_namespaceObject.readFileSync(log, "utf-8");
    console.log(content);
    var status = "/home/agent/agent.status";
    if (external_fs_namespaceObject.existsSync(status)) {
        console.log("status:");
        var content = external_fs_namespaceObject.readFileSync(status, "utf-8");
        console.log(content);
    }
}))();
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=index.js.map