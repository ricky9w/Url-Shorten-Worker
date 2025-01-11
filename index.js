/**
 * 配置项说明:
 * DEFAULT_REDIRECT_URL: 默认跳转的 URL, 例如: https://www.example.com
 * API_PASSWORD: POST 接口的密码, 例如: your_secure_password
 * UNIQUE_LINK: 是否唯一链接, 设置为 "true" 或 "false" 字符串
 */

// 从环境变量中获取配置, 如果环境变量不存在则使用默认值
const config = {
  default_redirect_url: typeof DEFAULT_REDIRECT_URL !== 'undefined' ? DEFAULT_REDIRECT_URL : "https://www.example.com",
  api_password: typeof API_PASSWORD !== 'undefined' ? API_PASSWORD : "your_secure_password",
  unique_link: typeof UNIQUE_LINK !== 'undefined' ? UNIQUE_LINK === "true" : true,
};

// 响应头，启用 CORS
const response_header = {
  "content-type": "text/html;charset=UTF-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * 生成指定长度的随机字符串 (用于生成短链接 key)
 * @param {number} len - 字符串长度, 默认为 6
 * @returns {string} - 生成的随机字符串
 */
async function randomString(len) {
  len = len || 6;
  let $chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678'; // 去掉了容易混淆的字符oOLl,9gq,Vv,Uu,I1
  let maxPos = $chars.length;
  let result = '';
  for (i = 0; i < len; i++) {
    result += $chars.charAt(Math.floor(Math.random() * maxPos));
  }
  return result;
}

/**
 * 计算 URL 的 SHA-512 哈希值
 * @param {string} url - 要计算哈希值的 URL
 * @returns {string} - URL 的 SHA-512 哈希值 (十六进制字符串)
 */
async function sha512(url) {
  url = new TextEncoder().encode(url)
  const url_digest = await crypto.subtle.digest(
    {
      name: "SHA-512",
    },
    url,
  )
  const hashArray = Array.from(new Uint8Array(url_digest));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * 检查 URL 是否有效 (简单的正则表达式检查)
 * @param {string} URL - 要检查的 URL
 * @returns {boolean} - 如果 URL 有效则返回 true, 否则返回 false
 */
async function checkURL(URL) {
  let str = URL;
  let Expression = /http(s)?:\/\/([\w-]+\.)+[\w-]+(\/[\w- .\/?%&=]*)?/;
  let objExp = new RegExp(Expression);
  if (objExp.test(str) == true) {
    if (str[0] == 'h')
      return true;
    else
      return false;
  } else {
    return false;
  }
}

/**
 * 将长 URL 保存到 KV 存储, 并返回生成的短链接 key
 * @param {string} URL - 要保存的长 URL
 * @returns {string} - 生成的短链接 key
 */
async function save_url(URL) {
  let random_key = await randomString()
  let is_exist = await LINKS.get(random_key)
  if (is_exist == null)
    return await LINKS.put(random_key, URL), random_key
  else
    return save_url(URL)
}

/**
 * 检查长 URL 的 SHA-512 哈希值是否已存在于 KV 存储中
 * @param {string} url_sha512 - 长 URL 的 SHA-512 哈希值
 * @returns {boolean|string} - 如果哈希值不存在则返回 false, 如果存在则返回对应的短链接 key
 */
async function is_url_exist(url_sha512) {
  let is_exist = await LINKS.get(url_sha512)
  if (is_exist == null) {
    return false;
  } else {
    return is_exist;
  }
}

/**
 * 主请求处理函数
 * @param {Request} request - 传入的请求对象
 * @returns {Response} - 响应对象
 */
async function handleRequest(request) {
  const requestURL = new URL(request.url)
  const path = requestURL.pathname.split("/")[1]

  // 处理 POST 请求 (创建短链接)
  if (request.method === "POST") {
    let req = await request.json()

    // 增加密码验证
    if (req["password"] !== config.api_password) {
      return new Response(`{"status":401,"msg":"Unauthorized: Invalid password."}`, {
        headers: response_header,
        status: 401
      })
    }

    if (!await checkURL(req["url"])) {
      return new Response(`{"status":400,"msg":"Bad Request: Invalid URL."}`, {
        headers: response_header,
        status: 400
      })
    }

    let random_key
    if (config.unique_link) {
      let url_sha512 = await sha512(req["url"])
      let url_key = await is_url_exist(url_sha512)
      if (url_key) {
        random_key = url_key
      } else {
        random_key = await save_url(req["url"])
        await LINKS.put(url_sha512, random_key)
      }
    } else {
      random_key = await save_url(req["url"])
    }

    return new Response(`{"status":200,"key":"/` + random_key + `"}`, {
      headers: response_header,
    })
  } else if (request.method === "OPTIONS") {
    // 处理 OPTIONS 预检请求
    return new Response(``, {
      headers: response_header,
    })
  }

  // 处理 GET 请求 (访问短链接)

  // 如果路径为空, 则重定向到默认 URL
  if (!path) {
    return Response.redirect(config.default_redirect_url, 302)
  }

  // 如果路径在 KV 中找不到, 则重定向到默认 URL
  const value = await LINKS.get(path);
  if (!value) {
    return Response.redirect(config.default_redirect_url, 302)
  }

  // 找到了对应的长 URL, 直接重定向
  return Response.redirect(value, 302)
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})