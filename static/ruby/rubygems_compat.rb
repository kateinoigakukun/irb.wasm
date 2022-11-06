require "rubygems/commands/install_command"

class Gem::Request
  def perform_request(request)
    promise = JS.global[:irbWorker].call(:gemRequestPerformRequest, JS::Object.wrap(request), JS::Object.wrap(@uri))
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

class Gem::Installer
  def build_extensions
      # HACK: skip ext build for now...
  end
end

class Gem::Specification
  # HACK: supress missing extension warning, which prevents "require" to work
  def missing_extensions? = false
end

def Gem.user_home = Dir.home
# HACK: Install gems under writable directory by default
def Gem.dir = Gem.user_dir

Gem.configuration.concurrent_downloads = 1
