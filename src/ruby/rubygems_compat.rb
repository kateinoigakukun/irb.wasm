require "rubygems/commands/install_command"

class JS::Object
  def to_a
      ary = []
      self[:length].to_i.times do |i|
          ary << self.call(:at, i).to_i
      end
      ary
  end
end

class Gem::Request
  def self.request(uri, request)
    if uri.hostname == "rubygems.org" or uri.hostname == "index.rubygems.org"
      uri.hostname = "irb-wasm-proxy.edgecompute.app"
    end
    options = JS.eval("return {}")
    options[:method] = request.method.to_s
    options[:headers] = JS.eval("return {}")
    request.each_capitalized do |k, v|
      options[:headers][k] = v
    end
    response = JS.global.fetch(uri.to_s, options).await
    content_type = response[:headers].get("Content-Type").to_s
    is_octet_stream = content_type.start_with?("application/octet-stream") || content_type == "binary/octet-stream"
    if uri.path.end_with?(".gem") or uri.path.end_with?(".rz") or is_octet_stream
      # FIXME: support class constructor and direct function call
      factory = JS.eval("return { make: (data) => new Uint8Array(data) }")
      body = factory.make response.arrayBuffer.await
    else
      body = response.text.await
    end
    if JS.is_a?(body, JS.global[:Uint8Array])
      body_str = body.to_a.pack("C*")
    else
      body_str = body.inspect
    end
    body_str = ::Gem::Net::BufferedIO.new(StringIO.new(body_str))

    status = response["status"].inspect
    response_class = ::Gem::Net::HTTPResponse::CODE_TO_OBJ[status]
    response = response_class.new("2.0", status.to_i, nil)

    response.reading_body(body_str, true) {}

    response
  end

  def perform_request(request) = Gem::Request.request(@uri, request)
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
