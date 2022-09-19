$LOAD_PATH << File.join(File.dirname(__FILE__), "vendor", "deps", "ruby.wasm", "lib")

require "rake/tasklib"
require "ruby_wasm/build_system"
require "ruby_wasm/rake_task"

Dir.glob("tasks/**.rake").each { |f| import f }

FULL_EXTS = "bigdecimal,cgi/escape,continuation,coverage,date,dbm,digest/bubblebabble,digest,digest/md5,digest/rmd160,digest/sha1,digest/sha2,etc,fcntl,fiber,gdbm,json,json/generator,json/parser,nkf,objspace,pathname,psych,racc/cparse,rbconfig/sizeof,ripper,stringio,strscan,monitor,zlib"

LIB_ROOT = File.expand_path("../vendor/deps/ruby.wasm", __FILE__)
BUILD_DIR = File.join(Dir.pwd, "build")

options = {
  target: "wasm32-unknown-wasi",
  src: { name: "head", type: "github", repo: "ruby/ruby", rev: "master", patches: [] },
  default_exts: FULL_EXTS,
  debug: true,
  build_dir: BUILD_DIR,
}

channel = "head-wasm32-unknown-wasi-full-js-irb"

build_task = RubyWasm::BuildTask.new(channel, **options) do |t|
  t.crossruby.user_exts = [
    RubyWasm::CrossRubyExtProduct.new(File.join(LIB_ROOT, "ext", "js"), t.toolchain),
    RubyWasm::CrossRubyExtProduct.new(File.join(LIB_ROOT, "ext", "witapi"), t.toolchain),
  ]
  t.crossruby.wasmoptflags = "-O2"
end

task :cache_key do
  puts build_task.hexdigest
end

wasi_vfs = build_task.wasi_vfs

RUBY_ROOT = File.join("rubies", channel)

desc "Build irb.wasm"
file "static/irb.wasm" => [channel, wasi_vfs.cli_install_task] do
  require "tmpdir"
  Dir.mktmpdir do |dir|
    tmpruby = File.join(dir, "ruby")
    cp_r RUBY_ROOT, tmpruby
    rm_rf File.join(tmpruby, "usr", "local", "include")
    rm_f File.join(tmpruby, "usr", "local", "lib", "libruby-static.a")
    ruby_wasm = File.join(dir, "ruby.wasm")
    mv File.join(tmpruby, "usr", "local", "bin", "ruby"), ruby_wasm
    sh "#{wasi_vfs.cli_bin_path} pack #{ruby_wasm} --mapdir /usr::#{File.join(tmpruby, "usr")} --mapdir /gems::./fake-gems -o static/irb.wasm"
  end
end
