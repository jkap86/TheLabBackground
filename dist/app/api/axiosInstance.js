"use strict";
const https = require("https");
const axios = require("axios");
const axiosRetry = require("axios-retry");
const axiosInstance = axios.create({
    headers: {
        "content-type": "application/json",
    },
    httpsAgent: new https.Agent({ keepAlive: true }),
    timeout: 3000,
});
axiosRetry(axiosInstance, {
    retries: 5,
    retryDelay: (retryNumber) => {
        return 2000 + retryNumber * 1000;
    },
});
module.exports = axiosInstance;
