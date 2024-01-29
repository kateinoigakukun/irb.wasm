module Reline

  class Unicode
    def self.calculate_width(str, allow_escape_code = false)
      str.length
    end
  end
end

module Timeout
  def self.timeout(sec, klass = nil, message = nil, &block)
    # possible problem
    # See Reline using `Timeout.timeout` twice
    yield
  end
end

