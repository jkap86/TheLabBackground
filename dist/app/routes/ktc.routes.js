"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ktc_controller_js_1 = require("../controllers/ktc.controller.js");
const router = (0, express_1.Router)();
router.get("/day", ktc_controller_js_1.getDayValues);
exports.default = router;
