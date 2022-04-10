RUBY_CHANNEL = head-wasm32-unknown-wasi-full
RUBY_SNAPSHOT = 2022-04-09-a
RUBY_ROOT = rubies/$(RUBY_CHANNEL)

$(RUBY_ROOT):
	mkdir -p rubies
	cd rubies && curl -L https://github.com/ruby/ruby.wasm/releases/download/$(RUBY_SNAPSHOT)/ruby-$(RUBY_CHANNEL).tar.gz | tar xz
	mv $(RUBY_ROOT)/usr/local/bin/ruby $(RUBY_ROOT)/ruby.wasm

static/irb.wasm: $(RUBY_ROOT)
	rm -rf $(RUBY_ROOT)/usr/local/include
	rm -f $(RUBY_ROOT)/usr/local/lib/libruby-static.a
	wasi-vfs pack $(RUBY_ROOT)/ruby.wasm --mapdir /usr::$(RUBY_ROOT)/usr --mapdir /gems::./fake-gems -o static/irb.wasm
