// src/index.js
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.3/node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  if (a === b) return true;
  if (!strict && isNullable(a) && isNullable(b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (!a || !b) return false;
  function check(test, then) {
    return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
  }
  return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
    if (a2.byteLength !== b2.byteLength) return false;
    const viewA = new Uint8Array(a2);
    const viewB = new Uint8Array(b2);
    for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
    return true;
  }) ?? Object.keys({
    ...a,
    ...b
  }).every((key) => deepEqual(a[key], b[key], strict));
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// node_modules/.pnpm/@deepseek-ai+schemastery@3.18.2/node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = /* @__PURE__ */ Symbol.for("schemastery");
var kValidationError = /* @__PURE__ */ Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
var resolvers = {};
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name2, keys, format) {
  formatters[name2] = format;
  Object.assign(Schema, { [name2](...args) {
    const schema = new Schema({ type: name2 });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name2 === "object" || name2 === "dict") schema.meta.default = {};
    else if (name2 === "array" || name2 === "tuple") schema.meta.default = [];
    else if (name2 === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/index.js
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var ASSETS_SFX = path.join(__dirname, "..", "assets", "sfx");
var ASSETS_MUSIC = path.join(__dirname, "..", "assets", "music");
var DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
var DATA_DIR = path.join(DSH_HOME, "dsh-tarkov");
var SOUNDS_DIR = path.join(DATA_DIR, "sounds");
var MUSIC_DIR = path.join(DATA_DIR, "music");
var PREFS_FILE = path.join(DATA_DIR, "prefs.json");
var MAX_PENDING = 3;
var MAX_MUSIC_BYTES = 200 * 1024 * 1024;
var SFX_KINDS = ["done", "approval", "error"];
var SETTINGS_NS = "dsh-theme-tarkov";
var TarkovSettingsSchema = Schema.object({});
var MIME = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac"
};
var DEFAULT_PREFS = {
  banner: {
    enabled: true,
    text1: "\u6CE8\u610F\uFF01\u8FD9\u662F\u201CDeepseek Harness\u201D\u7684Beta\u6D4B\u8BD5\u7248\u672C\u3002",
    text2: "Beta\u6D4B\u8BD5\u7248\u672C\u4E0D\u4EE3\u8868\u672C\u4EA7\u54C1\u7684\u6700\u7EC8\u8D28\u91CF\u3002\u611F\u8C22\u60A8\u7684\u7406\u89E3\u548C\u652F\u6301\uFF0C\u795D\u4F60\u597D\u8FD0\uFF01",
    opacity: 0.55
  },
  sfx: {
    enabled: true,
    volume: 70,
    // '' means the bundled seed sound; otherwise a { dataUrl, name } custom clip.
    sounds: { done: null, approval: null, error: null }
  },
  music: {
    enabled: false,
    volume: 40,
    trackId: null,
    // Track ids (file names) the user muted; excluded from the playable list.
    disabled: [],
    // Bundled track ids the user deleted; excluded from the library until the
    // client restores them (the files are never removed from the package).
    removed: []
  }
};
function mergePrefs(base, patch) {
  const out = JSON.parse(JSON.stringify(base));
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return out;
  for (const group of ["banner", "sfx", "music"]) {
    const p = patch[group];
    if (p === null || typeof p !== "object" || Array.isArray(p)) continue;
    out[group] = { ...out[group], ...p };
    if (group === "sfx" && p.sounds && typeof p.sounds === "object") {
      out.sfx.sounds = { ...out.sfx.sounds, ...p.sounds };
    }
  }
  return out;
}
function sanitizePrefs(raw) {
  const out = JSON.parse(JSON.stringify(DEFAULT_PREFS));
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
  const num = (v, min, max, fallback) => typeof v === "number" && v >= min && v <= max ? v : fallback;
  const str = (v, fallback, max = 500) => typeof v === "string" && v.length > 0 && v.length <= max ? v : fallback;
  const b = raw.banner;
  if (b && typeof b === "object") {
    if (typeof b.enabled === "boolean") out.banner.enabled = b.enabled;
    out.banner.text1 = str(b.text1, out.banner.text1);
    out.banner.text2 = str(b.text2, out.banner.text2);
    out.banner.opacity = num(b.opacity, 0, 1, out.banner.opacity);
  }
  const s = raw.sfx;
  if (s && typeof s === "object") {
    if (typeof s.enabled === "boolean") out.sfx.enabled = s.enabled;
    out.sfx.volume = num(s.volume, 0, 100, out.sfx.volume);
    if (s.sounds && typeof s.sounds === "object") {
      for (const kind of SFX_KINDS) {
        const c = s.sounds[kind];
        if (c === null) {
          out.sfx.sounds[kind] = null;
        } else if (c && typeof c === "object" && typeof c.dataUrl === "string" && typeof c.name === "string" && c.dataUrl.length <= 2 * 1024 * 1024) {
          out.sfx.sounds[kind] = { dataUrl: c.dataUrl, name: c.name };
        }
      }
    }
  }
  const m = raw.music;
  if (m && typeof m === "object") {
    if (typeof m.enabled === "boolean") out.music.enabled = m.enabled;
    out.music.volume = num(m.volume, 0, 100, out.music.volume);
    if (m.trackId === null) {
      out.music.trackId = null;
    } else if (typeof m.trackId === "string" && m.trackId.length > 0 && m.trackId.length <= 200 && !/[\\/]/.test(m.trackId) && !m.trackId.includes("..")) {
      out.music.trackId = m.trackId;
    }
    const idList = (v, key) => {
      if (!Array.isArray(v)) return;
      const seen = /* @__PURE__ */ new Set();
      const list = [];
      for (const item of v) {
        if (typeof item !== "string" || item.length === 0 || item.length > 200) continue;
        if (/[\\/]/.test(item) || item.includes("..")) continue;
        if (seen.has(item)) continue;
        seen.add(item);
        list.push(item);
        if (list.length >= 200) break;
      }
      out.music[key] = list;
    };
    idList(m.disabled, "disabled");
    idList(m.removed, "removed");
  }
  return out;
}
function loadPrefs() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PREFS_FILE, "utf8"));
    return sanitizePrefs(parsed);
  } catch (error) {
    return JSON.parse(JSON.stringify(DEFAULT_PREFS));
  }
}
function savePrefs(prefs) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
  } catch (error) {
    console.error("dsh-theme-tarkov: prefs write failed", error);
  }
}
function classifySessionEvent(event) {
  if (event === null || typeof event !== "object") return null;
  if (event.type === "turn/end") {
    const kind = event.data && event.data.reason && event.data.reason.kind;
    if (kind === "completed") return "done";
    if (kind === "blocked") return "approval";
    if (kind === "aborted" || kind === "error" || kind === "max-tokens") return "error";
    return null;
  }
  if (event.type === "approval/asked") return "approval";
  if (event.type === "tool/call") {
    const name2 = event.data && event.data.name;
    if (name2 === "ask_user_question") return "approval";
  }
  return null;
}
function createSfxState() {
  const queue = [];
  const awaitingApproval = /* @__PURE__ */ new Map();
  return {
    queue,
    handle(sessionId, event) {
      const scope = String(sessionId);
      if (event === null || typeof event !== "object") return false;
      if (event.type === "approval/decided") {
        awaitingApproval.set(scope, false);
        return false;
      }
      const type = classifySessionEvent(event);
      if (!type) return false;
      if (event.type === "approval/asked") {
        awaitingApproval.set(scope, true);
      }
      if (event.type === "turn/end" && type === "approval" && awaitingApproval.get(scope) === true) {
        return false;
      }
      if (queue.length >= MAX_PENDING) return false;
      queue.push({ type, sessionId: scope });
      return true;
    },
    drain() {
      const items = queue.slice();
      queue.length = 0;
      return items;
    }
  };
}
function ensureSoundsDir() {
  try {
    fs.mkdirSync(SOUNDS_DIR, { recursive: true });
    for (const kind of SFX_KINDS) {
      const target = path.join(SOUNDS_DIR, `${kind}.m4a`);
      if (fs.existsSync(target)) continue;
      const src = path.join(ASSETS_SFX, `${kind}.m4a`);
      if (fs.existsSync(src)) fs.copyFileSync(src, target);
    }
  } catch (error) {
    console.error("dsh-theme-tarkov: sound seeding failed", error);
  }
}
function ensureMusicDir() {
  try {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
  } catch (error) {
    console.error("dsh-theme-tarkov: music dir failed", error);
  }
}
var AUDIO_RE = /^(.+)\.([A-Za-z0-9]+)$/;
function scanDir(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (error) {
    return [];
  }
  const list = [];
  for (const name2 of names) {
    const match = AUDIO_RE.exec(name2);
    if (!match || !MIME[match[2].toLowerCase()]) continue;
    try {
      if (!fs.statSync(path.join(dir, name2)).isFile()) continue;
    } catch (error) {
      continue;
    }
    list.push({ id: name2, name: match[1] });
  }
  return list;
}
function listTracks(removedIds) {
  ensureMusicDir();
  const removed = new Set(Array.isArray(removedIds) ? removedIds : []);
  const builtinNames = new Set(scanDir(ASSETS_MUSIC).map((t) => t.name));
  const map = /* @__PURE__ */ new Map();
  for (const t of scanDir(MUSIC_DIR)) {
    if (!removed.has(t.name)) map.set(t.name, { ...t, builtin: builtinNames.has(t.name) });
  }
  for (const t of scanDir(ASSETS_MUSIC)) {
    if (!removed.has(t.name) && !map.has(t.name)) map.set(t.name, { ...t, builtin: true });
  }
  const list = [...map.values()];
  list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return list;
}
var name = "tarkov";
var inject = ["webServer", "fs"];
function apply(ctx) {
  ensureSoundsDir();
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.register(SETTINGS_NS, TarkovSettingsSchema);
  });
  let prefs = loadPrefs();
  const state = createSfxState();
  ctx.on("session/event", (session, event) => {
    if (!prefs.sfx.enabled) return;
    if (session === null || typeof session !== "object") return;
    if (session.header && session.header.origin === "subagent") return;
    state.handle(session.id, event);
  });
  function sendJson(res, body, status = 200) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  }
  async function resolveSfx(kind) {
    let entries;
    try {
      const dir = await ctx.fs.resolve(SOUNDS_DIR);
      entries = await ctx.fs.listDir(dir);
    } catch (error) {
      return null;
    }
    const re = new RegExp(`^${kind}\\.([A-Za-z0-9]+)$`);
    for (const entry of entries) {
      if (!entry || entry.type !== "file" || typeof entry.name !== "string") continue;
      const match = re.exec(entry.name);
      if (!match) continue;
      const mime = MIME[match[1].toLowerCase()] || "audio/mpeg";
      return { name: entry.name, mime };
    }
    return null;
  }
  const routes = [];
  function buildRoutes() {
    routes.length = 0;
    routes.push({
      kind: "exact",
      path: "/dsh-tarkov/prefs",
      handler: (req, res) => {
        if (req.method === "PUT" || req.method === "POST") {
          let body = "";
          let aborted = false;
          req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 4 * 1024 * 1024) {
              aborted = true;
              req.destroy();
            }
          });
          req.on("end", () => {
            if (aborted) return;
            try {
              const parsed = JSON.parse(body);
              if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("prefs must be an object");
              prefs = sanitizePrefs(mergePrefs(prefs, parsed));
              savePrefs(prefs);
              applyRoutes();
              sendJson(res, { ok: true, prefs });
            } catch (error) {
              sendJson(res, { ok: false, error: String(error && error.message || error) }, 400);
            }
          });
          req.on("error", () => {
          });
          return;
        }
        sendJson(res, { prefs });
      }
    });
    if (prefs.sfx.enabled) {
      routes.push({
        kind: "exact",
        path: "/dsh-tarkov/sfx-poll",
        handler: (req, res) => {
          sendJson(res, { items: state.drain() });
        }
      });
      routes.push({
        kind: "exact",
        path: "/dsh-tarkov/sfx",
        handler: async (req, res) => {
          let id = "";
          try {
            id = new URL(req.url, "http://dsh.local").searchParams.get("id") || "";
          } catch (error) {
          }
          if (!SFX_KINDS.includes(id)) {
            res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
            res.end("bad id");
            return;
          }
          try {
            const found = await resolveSfx(id);
            if (found === null) throw new Error("no sound for " + id);
            const target = await ctx.fs.resolve(SOUNDS_DIR + path.sep + found.name);
            const bytes = await ctx.fs.readBytes(target, void 0, 10 * 1024 * 1024);
            res.writeHead(200, {
              "content-type": found.mime,
              "content-length": String(bytes.length),
              "cache-control": "public, max-age=3600"
            });
            res.end(Buffer.from(bytes));
          } catch (error) {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            res.end("not found");
          }
        }
      });
    }
    routes.push({
      kind: "exact",
      path: "/dsh-tarkov/music",
      handler: (req, res) => {
        sendJson(res, { tracks: listTracks(prefs.music.removed), dir: MUSIC_DIR });
      }
    });
    routes.push({
      kind: "exact",
      path: "/dsh-tarkov/music/add",
      handler: (req, res) => {
        let name2 = "";
        try {
          name2 = new URL(req.url, "http://dsh.local").searchParams.get("name") || "";
        } catch (error) {
        }
        const match = AUDIO_RE.exec(name2);
        const ext = match ? match[2].toLowerCase() : "";
        if (!match || !MIME[ext] || name2.includes("/") || name2.includes("\\") || name2.includes("..")) {
          sendJson(res, { ok: false, error: "bad name" }, 400);
          return;
        }
        ensureMusicDir();
        const target = path.join(MUSIC_DIR, name2);
        const out = fs.createWriteStream(target);
        let size = 0;
        let failed = false;
        const abort = (status, message) => {
          if (failed) return;
          failed = true;
          out.destroy();
          try {
            fs.unlinkSync(target);
          } catch (error) {
          }
          sendJson(res, { ok: false, error: message }, status);
        };
        req.on("data", (chunk) => {
          if (failed) return;
          size += chunk.length;
          if (size > MAX_MUSIC_BYTES) {
            abort(413, "too large");
            return;
          }
          out.write(chunk);
        });
        req.on("end", () => {
          if (failed) return;
          out.end(() => {
            if (!failed) sendJson(res, { ok: true, track: { id: name2, name: match[1], builtin: false } });
          });
        });
        req.on("error", () => abort(400, "upload failed"));
        out.on("error", () => abort(500, "write failed"));
      }
    });
    routes.push({
      kind: "exact",
      path: "/dsh-tarkov/music/delete",
      handler: (req, res) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
          if (body.length > 64 * 1024) req.destroy();
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            const id = parsed && typeof parsed.id === "string" ? parsed.id : "";
            if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) {
              sendJson(res, { ok: false, error: "bad id" }, 400);
              return;
            }
            const nameMatch = AUDIO_RE.exec(id);
            const base = nameMatch ? nameMatch[1] : "";
            if (base && scanDir(ASSETS_MUSIC).some((t) => t.name === base)) {
              for (const t of scanDir(MUSIC_DIR)) {
                if (t.name === base) {
                  try {
                    fs.unlinkSync(path.join(MUSIC_DIR, t.id));
                  } catch (error) {
                  }
                }
              }
              const removed = Array.from(/* @__PURE__ */ new Set([...prefs.music.removed, base]));
              const disabled = prefs.music.disabled.filter((x) => !x.startsWith(base + "."));
              prefs = sanitizePrefs(mergePrefs(prefs, { music: { removed, disabled } }));
              savePrefs(prefs);
              sendJson(res, { ok: true });
              return;
            }
            const target = path.join(MUSIC_DIR, id);
            try {
              fs.unlinkSync(target);
            } catch (error) {
              sendJson(res, { ok: false, error: "not found" }, 404);
              return;
            }
            sendJson(res, { ok: true });
          } catch (error) {
            sendJson(res, { ok: false, error: String(error && error.message || error) }, 400);
          }
        });
        req.on("error", () => {
        });
      }
    });
    if (prefs.music.enabled) {
      routes.push({
        kind: "exact",
        path: "/dsh-tarkov/audio",
        handler: (req, res) => {
          let id = "";
          try {
            id = new URL(req.url, "http://dsh.local").searchParams.get("id") || "";
          } catch (error) {
          }
          if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) {
            res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
            res.end("bad id");
            return;
          }
          const userPath = path.join(MUSIC_DIR, id);
          const full = fs.existsSync(userPath) ? userPath : path.join(ASSETS_MUSIC, id);
          try {
            const stat = fs.statSync(full);
            if (!stat.isFile()) throw new Error("not a file");
            const ext = (path.extname(id) || "").slice(1).toLowerCase();
            const mime = MIME[ext] || "application/octet-stream";
            res.writeHead(200, {
              "content-type": mime,
              "content-length": String(stat.size),
              "accept-ranges": "bytes",
              "cache-control": "public, max-age=3600"
            });
            const stream = fs.createReadStream(full);
            stream.on("error", () => res.destroy());
            stream.pipe(res);
          } catch (error) {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            res.end("not found");
          }
        }
      });
    }
  }
  let disposeRoutes = null;
  function applyRoutes() {
    buildRoutes();
    disposeRoutes?.();
    const disposers = routes.map((route) => ctx.webServer.register(route));
    disposeRoutes = () => {
      for (const dispose of disposers) dispose();
    };
  }
  ctx.effect(() => {
    applyRoutes();
    return () => {
      disposeRoutes?.();
      disposeRoutes = null;
    };
  }, "dsh-theme-tarkov: routes");
}
export {
  DEFAULT_PREFS,
  apply,
  classifySessionEvent,
  createSfxState,
  inject,
  mergePrefs,
  name,
  sanitizePrefs
};
