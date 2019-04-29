cdk list | % { cdk destroy $_ -f }
 
aws s3 ls | % { $_.Substring(20) } | where { $_ -like "*pipeline*"} | % { aws s3 rb s3://$_ --force }