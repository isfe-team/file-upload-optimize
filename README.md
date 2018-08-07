# file-upload-optimize

Optimize file upload, use slice and support to resume from break. WIP -，-

@bqliu @qqzhu3

## background

为什么要支持分片上传和断点续传呢？其实是为了大文件（比如 200MB）上传，如果一次上传这样一个大文件，可能会很耗时间，而且可能会引起卡顿（未验证）。另外如果上传失败，最好是能支持断点续传，这样也能节省流量和时间。

服务端如果一次接收太大文件，也可能会 maxFileSize exceeded。

不过这时候服务端让它接收好之后，分块去储存就好。

## think

对于大文件分片上传，并且支持断点续传，初步的想法自然是通过 `slice` 将文件进行合理的大小划分（可配置），然后可以配置并行/按序上传，当然上传时需要提供相应的索引甚至 md5 值，用于服务端拼接以及验证块的正确性。

## some other

可以考虑一下继续下载（Range），但是浏览器端是做不了的（目测），因为无法访问本地文件（写权限）。

## notes

- 对于文件分片了，如果用户刷新了浏览器应该也是不行的。除非将 Blob 能持久化到本地（比如 Base64 到 localStorage/sessionStorage）。

- 如果中间过程中服务端也发生异常了，客户端如何处理其实也很麻烦。

## refs
