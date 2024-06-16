# HACK: trick bundler to think that we are supporting https
module OpenSSL
  module SSL
    VERIFY_PEER = 0
    class SSLError < StandardError; end
  end
end

class Socket
  class << self
    def method_missing(sym, *) = nil
  end
end

class SocketError; end

def Dir.home = "/home/me"

module Winsize
  def winsize
    [JS.global[:term][:rows].to_i, JS.global[:term][:cols].to_i]
  end
end

class IO
  # NOTE: $stdout also calls winsize in Reline
  include Winsize
end

class NonBlockingIO
  include Winsize

  def raw(intr: nil, min: nil, time: nil, tim: nil, &block)
    block&.call(self)
  end

  def read_nonblock(maxlen, outbuf = nil, exception: true)
    outbuf = "" unless outbuf
    while true
      ch = JS.global[:irbWorker][:term][:keyBuffer].getch.to_s
      if ch == "null" || maxlen <= outbuf.length
        break
      else
        outbuf << ch
      end
    end
    if 0 < outbuf.length
      outbuf
    else
      ""
    end
  end

  def getbyte
    getch&.ord
  end

  def getch
    ch = JS.global[:irbWorker][:term][:keyBuffer].getch.to_s
    if ch.ord == 3 # Ctrl-C -> SIGINT
      Process.kill :INT, Process.pid
      nil
    else
      ch == "null" ? nil : ch
    end
  end

  def getc
    JS.global[:irbWorker][:term][:keyBuffer].getc.await.to_s
  end

  def external_encoding
    "UTF-8"
  end

  def wait_readable(timeout = nil)
    return true if JS.global[:irbWorker][:term][:keyBuffer].readable.to_s == "true"
    if JS.global[:irbWorker][:term][:keyBuffer].wait_readable(
      # `1` is unused fallback because Reline always specifies timeout argument
      JS.eval("return #{timeout || 1}")
    ).await.to_s == "true"
      return self
    else
      return nil
    end
  rescue
    return nil
  end

  def ungetc(c)
    JS.global[:irbWorker][:term][:keyBuffer].ungetc(c)
  end

  def tty?
    true
  end
end

class IO
  class << self
    alias_method :original_open, :open
    def fake_open(fd, ...)
      if fd == 0
        return NonBlockingIO.new
      end
      original_open(fd, ...)
    end
    alias_method :open, :fake_open
  end

  # TODO(katei): Return WASI_RIGHTS_FD_SEEK | WASI_RIGHTS_FD_TELL as rights_base
  # https://github.com/WebAssembly/wasi-libc/blob/ad5133410f66b93a2381db5b542aad5e0964db96/libc-bottom-half/sources/isatty.c
  def tty?
    case to_i
    when 0, 1, 2; true
    else false
    end
  end
end

class Thread
  def self.new(&block)
    f = Fiber.new(&block)
    def f.value = resume
    f
  end
end

def File.chmod(mode, *paths) = nil
class File
  def chmod(mode) = nil
end

alias orig_puts puts
def puts(*args)
  args.each do |arg|
    orig_puts(arg.respond_to?(:gsub) ? arg.gsub("\n", "\r\n") : arg)
    print "\r"
  end
  nil
end

def sleep(sec)
  JS.global[:irbWorker].sleep_ms(JS.eval("return #{sec * 1000}")).await
  return sec.to_i
end
