rm -rf package
mv dist package
tar -czf llonebot-dist.tgz package/*
npm publish llonebot-dist.tgz
