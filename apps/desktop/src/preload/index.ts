import { contextBridge } from "electron";
import { PRODUCT_NAME, PRODUCT_VERSION } from "../shared/product";

contextBridge.exposeInMainWorld("lurkwire", {
  product: PRODUCT_NAME,
  version: PRODUCT_VERSION,
});
