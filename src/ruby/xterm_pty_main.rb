require "js"

# Hack to ignore "require 'io/console'" and "require 'io/wait'"
$LOADED_FEATURES << "io/console" << "io/wait"
Gem::Specification.find_by_name("reline").dependencies.clear

# io shim
class IO
  alias getbyte_orig getbyte
  def getbyte
    if to_i == 0
      c = JSFuncs[:getByte].apply().await
      return c == JS::Null ? nil : c.to_i
    end
    getbyte_orig
  end

  alias getc_orig getc
  def getc
    return getbyte&.chr if to_i == 0
    getc_orig
  end

  alias read_nonblock_orig read_nonblock
  def read_nonblock(size, outbuf = nil, exception: true)
    if to_i == 0
      s = JSFuncs[:readNonblock].apply(size).await
      return nil if s == JS::Null
      s = s.to_s
      s = outbuf.replace(s) if outbuf
      return s
    end
    read_nonblock_orig(size, outbuf, exception:)
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

# Run irb
IRB.setup(nil, argv: ['--no-pager'])
IRB::Irb.new.run
