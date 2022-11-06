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


class NonBlockingIO
  def gets
    JS.global[:irbWorker][:lineBuffer].readLine.await.to_s
  end

  def external_encoding
    "US-ASCII"
  end

  def wait_readable(timeout = nil)
    true
  end

  def getc = "x"
  def ungetc(c) = nil
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
