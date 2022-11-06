require "bundler"
class Bundler::ProcessLock
  def self.lock(*)
    # HACK: no flock on browser...
    yield
  end
end

class FetchConnection
  def initialize
    @headers = {}
    @headers["User-Agent"] = "Bundler/RubyGems on irb.wasm"
  end
  def request(uri, request)
    promise = JS.global[:irbWorker].call(:gemRequestPerformRequest, JS::Object.wrap(request), JS::Object.wrap(uri))
    results = promise.await
    response, body_bytes = results[:response], results[:body]
    if JS.is_a?(body_bytes, JS.global[:Uint8Array])
        body_str = body_bytes.to_a.pack("C*")
    else
        body_str = body_bytes.inspect
    end
    body_str = Net::BufferedIO.new(StringIO.new(body_str))

    status = response["status"].inspect
    response_class = Net::HTTPResponse::CODE_TO_OBJ[status]
    response = response_class.new("2.0", status.to_i, nil)

    response.reading_body(body_str, true) {}

    response
  end
end

class Bundler::Fetcher
  def connection
    @connection ||= begin
        con = FetchConnection.new
    end
  end
end

# HACK: OpenSSL::Digest is not available
module Bundler::SharedHelpers
  def md5_available? = false
end
