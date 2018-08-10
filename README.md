# file-upload-optimize

Optimize file upload, use slice and support to resume from break. -，-

@bqliu @qqzhu3

## Background

TODO...

## Think

对于大文件分片上传，并且支持断点续传，最直接的想法自然是通过 `slice`，将文件进行合理的大小划分（可配置），然后可以配置一次上传多少个块（是否真的能并发上传，还得看宿主环境支持），另外上传时需要提供相应的索引甚至 md5 值，用于服务端拼接以及验证块的正确性。

## Usage

### Install

```sh
$ npm i
```

### Run server and start present

```sh
$ npm run server
$ npm run present
```

## Others

可以考虑一下继续下载（Range），但是浏览器端是做不了的（目测），因为无法访问本地文件（写权限）。

## notes

- 对于文件分片了，如果用户刷新了浏览器应该也是不行的。除非将 Blob 能持久化到本地（比如 Base64 到 localStorage/sessionStorage）。所以并非真正的“断点续传”。

- 如果中间过程中服务端也发生异常了，客户端如何处理其实也很麻烦，现在是直接处于错误状态，继续上传，没有增加重试次数支持，作为新特性后续考虑加入。

## Refs

无。
