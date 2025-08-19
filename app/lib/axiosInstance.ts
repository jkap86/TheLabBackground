import axios from "axios";
import axiosRetry from "axios-retry";
import https from "https";

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ keepAlive: true }),
  timeout: 5000,
});

axiosRetry(axiosInstance, {
  retries: 5,
  retryDelay: (retryNumber: number) => {
    return 2000 + retryNumber * 1000;
  },
});

export default axiosInstance;
