require "bundler"
class Bundler::ProcessLock
  def self.lock(*)
    # HACK: no flock on browser...
    yield
  end
end

class FetchConnection
  def request(uri, request) = Gem::Request.request(uri, request)
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
