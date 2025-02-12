require "js"
# io shim
class IO
  @@ungetc_buf = []

  alias getbyte_orig getbyte
  def getbyte
    if to_i == 0
      return @@ungetc_buf.pop.ord if !@@ungetc_buf.empty?
      c = JSFuncs[:getByte].apply().await
      return c == JS::Null ? nil : c.to_i
    end
    getbyte_orig
  end

  alias getc_orig getc
  def getc
    if to_i == 0
      return @@ungetc_buf.pop.chr if !@@ungetc_buf.empty?
      return getbyte&.chr
    end
    getc_orig
  end

  alias read_nonblock_orig read_nonblock
  def read_nonblock(size, outbuf = nil, exception: true)
    if to_i == 0
      if @@ungetc_buf.empty?
        b = nil
      else
        # XXX: This might return a buffer larger than the specified size,
        # but I believe it's OK ;-P
        b = @@ungetc_buf.reverse.join
        @@ungetc_buf.clear
      end
      s = JSFuncs[:readNonblock].apply(size).await
      return b if s == JS::Null
      s = s.to_s
      s = outbuf.replace(s) if outbuf
      s = b + s if b
      return s
    end
    read_nonblock_orig(size, outbuf, exception:)
  end

  alias readpartial_orig readpartial
  def readpartial(n)
    if to_i == 0
      c = getc
      s = read_nonblock(n - 1)
      s = s ? c + s : c
      return s
    end
    readpartial_orig(n)
  end

  alias ungetc_orig ungetc
  def ungetc(n)
    if to_i == 0
      @@ungetc_buf << n.chr
      return nil
    end
    ungetc_orig(n)
  end
end

# io/console shim
class IO
  def winsize
    JSFuncs[:winsize].apply().to_a.map {|n| n.to_i }.reverse
  end

  def raw(min: 1, time: 0, intr: false)
    raise NotImplementedError if time != 0
    begin
      old_termios = JSFuncs[:setRaw].apply(min, intr)
      yield self
    ensure
      JSFuncs[:setTermios].apply(old_termios)
    end
  end

  def cooked
    begin
      old_termios = JSFuncs[:setCooked].apply()
      yield self
    ensure
      JSFuncs[:setTermios].apply(old_termios)
    end
  end

  def tty?
    case to_i
    when 0, 1, 2; true
    else false
    end
  end
end

# io/wait shim
class IO
  def wait_readable(timeout)
    JSFuncs[:waitReadable].apply(timeout).await != JS::False ? self : nil
  end
end

# Kernel#sleep shim
module Kernel
  def sleep(duration = nil)
    JSFuncs[:sleep].apply(duration).await
    nil
  end
end

# ENV["HOME"] = "/" # Hack to pass `File.expand_path("~/")`
ENV["TERM"] = "xterm-256color"

require "irb"

# A workaround to skip permission check
# because @bjorn3/browser_wasi_shim does not implement permissions
module IRB
  module HistorySavingAbility
    def ensure_history_file_writable(_)
      true
    end
  end
end

# Run irb
IRB.setup(nil, argv: ['--no-pager'])
IRB::Irb.new.run
